/**
 * Selection panel (bottom centre): unit groups, cannons, buildings, wall
 * sections, ships and mines — with order buttons and quick actions.
 */
import type { ComponentChildren } from 'preact';
import type { PickResult } from '../../core/feature';
import { FLAG } from '../../core/flags';
import { RESOURCE_ADI, RESOURCE_IDS, type Building, type Cannon, type GameState, type Mine, type Ship, type UnitGroup, type WallSection } from '../../core/state';
import { store } from '../../core/store';
import { SECTION_BY_ID } from '../../data/sections';
import { COMMANDERS, UNIT_TYPES } from '../../features/army/data';
import { cannonStatusText, cannonsTargeting } from '../../features/artillery/api';
import { CANNON_TYPES, STATUS_ADI } from '../../features/artillery/data';
import { buildingDef, edirneActionCheck, hisarStatus, labourFactor, productionBonus, staffRate, workforceInfo } from '../../features/economy/api';
import { navyCommander, shipName } from '../../features/navy/api';
import { SHIP_TYPES } from '../../features/navy/data';
import { fmtCompact, fmtInt, fmtPct } from './format';
import { startTarget } from './Katmanlar';
import { GROUP_STATUS_ADI, HUD_ORDERS, MINE_STATUS_ADI, ORDER_ADI, pickGroupFor, readyCannonsInRange, safe, SHIP_STATUS_ADI, SIDE_ADI, unitTypeName, type HudOrder } from './logic';
import { opt, type TowerV } from './opt';
import { askConfirm, Btn, Cubuk, Ikon, Ipucu, TexIkon } from './ui';

function fmtCost(c: Partial<Record<string, number>>): string {
  return RESOURCE_IDS.filter((r) => (c[r] ?? 0) > 0)
    .map((r) => `${fmtInt(c[r] ?? 0)} ${RESOURCE_ADI[r].toLocaleLowerCase('tr')}`)
    .join(' · ');
}

function Satir({ ad, children, genis }: { ad: string; children: ComponentChildren; genis?: boolean }) {
  return (
    <div class={`satir ${genis ? 'genis' : ''}`}>
      <span class="satir-ad">{ad}</span>
      <span class="satir-deger">{children}</span>
    </div>
  );
}

function BarSatir({ ad, deger, max = 1, tur, metin, isaret }: { ad: string; deger: number; max?: number; tur: string; metin?: string; isaret?: number }) {
  const f = max > 0 ? deger / max : 0;
  return (
    <div class="satir">
      <span class="satir-ad">{ad}</span>
      <Cubuk deger={f} tur={tur} isaret={isaret} />
      <span class="satir-sayi num">{metin ?? fmtPct(f)}</span>
    </div>
  );
}

function Ust({ ikon, ad, alt, sag }: { ikon: ComponentChildren; ad: string; alt?: ComponentChildren; sag?: ComponentChildren }) {
  return (
    <div class="secim-ust">
      <div class="secim-portre">{ikon}</div>
      <div class="secim-ad">
        <div class="secim-isim">{ad}</div>
        {alt && <div class="secim-alt">{alt}</div>}
      </div>
      {sag && <div class="secim-sag">{sag}</div>}
    </div>
  );
}

// ───────────────────────────── Groups ─────────────────────────────

function emirVer(s: GameState, groups: UnitGroup[], o: HudOrder): void {
  const ids = groups.map((g) => g.id);
  const def = HUD_ORDERS.find((x) => x.id === o)!;
  if (o === 'lagim-kaz') {
    const lag = groups.filter((g) => g.type === 'lagimci').map((g) => g.id);
    startTarget({ kind: 'lagim', groupIds: lag, label: 'Lağım kazılacak sur kesimini seç', landOnly: true });
    return;
  }
  if (o === 'hendek-doldur') {
    startTarget({ kind: 'hendek', groupIds: ids, label: 'Hendeği doldurulacak kesimi seç', landOnly: true });
    return;
  }
  if (def.needsSection) {
    startTarget({ kind: 'emir', order: 'hucum', groupIds: ids, label: 'Hücum edilecek sur kesimini seç' });
    return;
  }
  store.dispatch({ t: 'emir', groupIds: ids, order: { type: o } });
}

function EmirButonlari({ s, groups }: { s: GameState; groups: UnitGroup[] }) {
  const siege = s.time.phase === 'kusatma';
  return (
    <div class="emirler">
      {HUD_ORDERS.map((o) => {
        let reason: string | null = null;
        if (!siege && o.id !== 'dinlen' && o.id !== 'geri-cekil') reason = 'Kuşatma başlamadı';
        if (o.only && !groups.some((g) => o.only!.includes(g.type))) reason = 'Seçili birlikler arasında lağımcı yok';
        if (!reason) {
          // army's own rule check: disabled only if no selected group may take the order
          const fails = groups.map((g) => opt.canOrder(s, g, o.id));
          if (fails.length && fails.every((f) => !!f)) reason = fails[0];
        }
        const active = groups.length > 0 && groups.every((g) => g.order.type === o.id);
        return (
          <Btn
            key={o.id}
            tur={o.id === 'hucum' ? 'kirmizi' : 'lapis'}
            class="emir-btn"
            aktif={active}
            disabled={!!reason}
            ipucu={
              <div class="ipucu-icerik">
                <b>{o.label}</b>
                {o.needsSection && <div class="ipucu-metin soluk">Ardından haritada bir sur kesimine tıkla.</div>}
                {reason && <div class="ipucu-metin kirmizi-yazi">{reason}</div>}
              </div>
            }
            onClick={() => emirVer(s, groups, o.id)}
          >
            <Ikon ad={o.icon} />
            <span>{o.label}</span>
          </Btn>
        );
      })}
    </div>
  );
}

function BirlikPaneli({ s, g }: { s: GameState; g: UnitGroup }) {
  const ut = safe(() => UNIT_TYPES[g.type], undefined);
  const cmd = opt.commanderOf(g) ?? (g.commanderId ? safe(() => COMMANDERS.find((c) => c.id === g.commanderId), undefined) : undefined);
  const away = g.status === 'uzakta' ? opt.awayReason(s, g) : null;
  const orderTarget = g.order.sectionId ? s.sections[g.order.sectionId]?.name : null;
  return (
    <>
      <Ust
        ikon={<TexIkon tex={ut?.icon} yedek="asker" max={20} />}
        ad={g.name}
        alt={
          <>
            {unitTypeName(g.type)}
            {cmd && (
              <Ipucu
                icerik={
                  <div class="ipucu-icerik">
                    <div class="ipucu-baslik">{cmd.name}</div>
                    <div class="ipucu-metin soluk">{cmd.title}</div>
                    <div class="ipucu-metin">{cmd.bonusText}</div>
                  </div>
                }
              >
                <span class="komutan"> · {cmd.name}</span>
              </Ipucu>
            )}
          </>
        }
        sag={<span class={`durum durum-${g.status}`}>{GROUP_STATUS_ADI[g.status] ?? g.status}</span>}
      />
      <div class="secim-izgara">
        <BarSatir ad="Asker" deger={g.men} max={g.maxMen} tur="kirmizi" metin={`${fmtInt(g.men)}/${fmtInt(g.maxMen)}`} />
        <BarSatir ad="Moral" deger={g.morale} max={100} tur={g.morale < 30 ? 'kirmizi' : 'yesil'} />
        <BarSatir ad="Yorgunluk" deger={g.fatigue} max={100} tur="turuncu" />
        <BarSatir ad="Tecrübe" deger={g.xp} max={100} tur="altin" />
      </div>
      <div class="secim-emir-durum">
        Emir: <b>{ORDER_ADI[g.order.type] ?? g.order.type}</b>
        {orderTarget && <span> — {orderTarget}</span>}
        {away && <span class="soluk"> · {away}</span>}
      </div>
      <EmirButonlari s={s} groups={[g]} />
    </>
  );
}

function BirliklerPaneli({ s, groups }: { s: GameState; groups: UnitGroup[] }) {
  const men = groups.reduce((a, g) => a + g.men, 0);
  const morale = groups.reduce((a, g) => a + g.morale * g.men, 0) / Math.max(1, men);
  const fatigue = groups.reduce((a, g) => a + g.fatigue * g.men, 0) / Math.max(1, men);
  const byType = new Map<string, number>();
  for (const g of groups) byType.set(g.type, (byType.get(g.type) ?? 0) + 1);
  return (
    <>
      <Ust ikon={<Ikon ad="asker" />} ad={`${groups.length} birlik`} alt={<span class="num">{fmtInt(men)} asker</span>} />
      <div class="birlik-cipleri">
        {[...byType.entries()].map(([t, n]) => (
          <span key={t} class="cip">
            {unitTypeName(t as UnitGroup['type'])} <b class="num">×{n}</b>
          </span>
        ))}
      </div>
      <div class="secim-izgara">
        <BarSatir ad="Ort. moral" deger={morale} max={100} tur={morale < 30 ? 'kirmizi' : 'yesil'} />
        <BarSatir ad="Yorgunluk" deger={fatigue} max={100} tur="turuncu" />
      </div>
      <EmirButonlari s={s} groups={groups} />
    </>
  );
}

// ───────────────────────────── Cannons ─────────────────────────────

function AtisPipleri({ n, max }: { n: number; max: number }) {
  if (max > 14) return <span class="num">{`${n}/${max}`}</span>;
  return (
    <span class="pipler">
      {Array.from({ length: max }, (_, i) => (
        <i key={i} class={i < n ? 'pip dolu' : 'pip'} />
      ))}
    </span>
  );
}

function TopPaneli({ s, c }: { s: GameState; c: Cannon }) {
  const def = CANNON_TYPES[c.type];
  const status = safe(() => cannonStatusText(s, c), STATUS_ADI[c.status] ?? c.status);
  const target = c.targetSection ? s.sections[c.targetSection]?.name : null;
  const onMap = c.status !== 'dokuluyor' && c.tx >= 0;
  return (
    <>
      <Ust ikon={<TexIkon tex={def?.icon} yedek="gulle" max={20} />} ad={c.name} alt={def?.name} sag={<span class={`durum top-${c.status}`}>{STATUS_ADI[c.status] ?? c.status}</span>} />
      <div class="secim-durum-yazi">{status}</div>
      <div class="secim-izgara">
        <BarSatir ad="Namlu ısısı" deger={c.heat} tur={c.heat > 0.75 ? 'kizgin' : 'isi'} />
        {(c.status === 'dokuluyor' || c.status === 'yolda' || c.status === 'mevzileniyor') && <BarSatir ad="İlerleme" deger={c.progress} tur="altin" />}
        <Satir ad="Bugün atış">{def ? <AtisPipleri n={c.shotsToday} max={def.shotsPerDay} /> : c.shotsToday}</Satir>
        {def && (
          <Satir ad="Mühimmat">
            <span class="muhimmat">
              <Ikon ad="barut" /> <span class="num">{def.barutPerShot}</span>
              <Ikon ad="gulle" /> <span class="num">{def.gullePerShot}</span>
              <span class="soluk"> / atış</span>
            </span>
          </Satir>
        )}
        <Satir ad="Hedef">{target ? <b>{target}</b> : <span class="soluk">Hedef yok</span>}</Satir>
      </div>
      <div class="emirler">
        <Btn
          tur="kirmizi"
          class="emir-btn"
          disabled={!onMap || s.time.phase !== 'kusatma'}
          ipucu={<div class="ipucu-icerik">Yeni hedef sur kesimi seç. Kısayol: top seçiliyken sur kesimine sağ tıkla.</div>}
          onClick={() => startTarget({ kind: 'top', cannonIds: [c.id], label: `${c.name}: hedef sur kesimini seç` })}
        >
          <Ikon ad="emir-hucum" />
          <span>Hedef seç</span>
        </Btn>
        {c.status === 'kirik' && (
          <Btn tur="lapis" class="emir-btn" onClick={() => store.dispatch({ t: 'ozel', feature: 'artillery', action: 'onar', payload: { cannonId: c.id } })}>
            <Ikon ad="insa" />
            <span>Çemberle onar</span>
          </Btn>
        )}
      </div>
      <div class="ipucu-satiri">Sağ tık: sur kesimine hedef ver</div>
    </>
  );
}

function ToplarPaneli({ s, cs }: { s: GameState; cs: Cannon[] }) {
  const byType = new Map<string, number>();
  for (const c of cs) byType.set(c.type, (byType.get(c.type) ?? 0) + 1);
  const ready = cs.filter((c) => c.status === 'hazir').length;
  return (
    <>
      <Ust ikon={<Ikon ad="gulle" />} ad={`${cs.length} top`} alt={`${ready} tanesi atışa hazır`} />
      <div class="birlik-cipleri">
        {[...byType.entries()].map(([t, n]) => (
          <span key={t} class="cip">
            {CANNON_TYPES[t as Cannon['type']]?.name ?? t} <b class="num">×{n}</b>
          </span>
        ))}
      </div>
      <div class="emirler">
        <Btn
          tur="kirmizi"
          class="emir-btn"
          disabled={s.time.phase !== 'kusatma'}
          onClick={() => startTarget({ kind: 'top', cannonIds: cs.map((c) => c.id), label: 'Topların hedef sur kesimini seç' })}
        >
          <Ikon ad="emir-hucum" />
          <span>Hepsine hedef seç</span>
        </Btn>
      </div>
    </>
  );
}

// ───────────────────────────── Buildings ─────────────────────────────

function YapiPaneli({ s, b }: { s: GameState; b: Building }) {
  const def = safe(() => buildingDef(b.type), undefined);
  if (!def) return <Ust ikon={<Ikon ad="insa" />} ad={b.type} />;
  const rate = safe(() => staffRate(b) * (def.workersMax > 0 ? labourFactor(s) : 1) * productionBonus(s, b), 0);
  const step = Math.max(1, Math.round(def.workersMax / 8));
  const hisar = b.type === 'rumeli-hisari' ? safe(() => hisarStatus(s), null) : null;
  const setW = (w: number) => store.dispatch({ t: 'isci-ata', buildingId: b.id, workers: Math.max(0, Math.min(def.workersMax, w)) });
  const free = safe(() => workforceInfo(s).idle, Math.max(0, s.workforce.total - s.workforce.assigned));
  return (
    <>
      <Ust ikon={<TexIkon tex={def.icon} yedek="insa" max={20} />} ad={def.name} alt={b.built ? 'Tamamlandı' : 'İnşa ediliyor'} sag={!b.built ? <span class="num buyuk-yuzde">{fmtPct(b.progress)}</span> : undefined} />
      {!b.built && !hisar && <Cubuk deger={b.progress} tur="altin" class="cubuk-genis insa-cubuk" />}
      {hisar && (
        <div class="hisar-parcalar">
          <div class="secim-durum-yazi">
            {hisar.stageName} · <b class="num">{fmtPct(hisar.progress)}</b>
            {hisar.ihsanActive && <span class="etiket altin-etiket">İhsan</span>}
          </div>
          {hisar.parts.map((p) => {
            const kule = HISAR_KULE.includes(p.id);
            const on = hisar.priority === p.id;
            return (
              <div key={p.id} class={`satir hisar-parca ${on ? 'oncelikli' : ''}`}>
                <span class="satir-ad" title={p.pasha}>
                  {p.name}
                </span>
                <Cubuk deger={p.progress} tur={p.progress >= 1 ? 'yesil' : on ? 'kizgin' : 'altin'} />
                <span class="satir-sayi num">{fmtPct(p.progress)}</span>
                {kule && !hisar.done && p.progress < 1 && (
                  <Btn
                    tur={on ? 'altin' : 'kagit'}
                    class="kare-btn oncelik-btn"
                    aktif={on}
                    ipucu={
                      <div class="ipucu-icerik">
                        {on ? 'Önceliği kaldır' : `${p.name} önce bitsin: amele buraya yığılır.`}
                        {p.pasha && <div class="soluk">Yapımı üstlenen: {p.pasha}</div>}
                      </div>
                    }
                    onClick={() => store.dispatch({ t: 'ozel', feature: 'economy', action: 'hisar-oncelik', payload: { kule: on ? null : p.id } })}
                  >
                    <Ikon ad="sancak-kucuk" />
                  </Btn>
                )}
              </div>
            );
          })}
          {!hisar.done && <HisarIhsan s={s} active={hisar.ihsanActive} />}
        </div>
      )}
      {def.workersMax > 0 && !hisar && (
        <div class="isci-satiri">
          <span class="satir-ad">İşçi</span>
          <Btn tur="kagit" class="kare-btn" disabled={b.workers <= 0} onClick={() => setW(b.workers - step)}>
            −
          </Btn>
          <span class="num isci-sayi">
            {fmtInt(b.workers)}
            <span class="soluk">/{fmtInt(def.workersMax)}</span>
          </span>
          <Btn tur="kagit" class="kare-btn" disabled={b.workers >= def.workersMax || free <= 0} onClick={() => setW(b.workers + Math.min(step, free))}>
            +
          </Btn>
          <span class="soluk kucuk">boşta {fmtInt(free)}</span>
          {b.data.manual === true && (
            <Btn tur="kagit" class="kucuk-btn" ipucu={<div class="ipucu-icerik">İşçi sayısını yeniden kâhyaya bırak (otomatik dağıtım).</div>} onClick={() => store.dispatch({ t: 'isci-ata', buildingId: b.id, workers: -1 })}>
              Oto
            </Btn>
          )}
        </div>
      )}
      {b.built && (def.produces || def.consumes) && (
        <div class="uretim">
          {RESOURCE_IDS.filter((r) => def.produces?.[r]).map((r) => (
            <span key={r} class="uretim-cip artti">
              <Ikon ad={r} /> +{fmtInt((def.produces![r] ?? 0) * rate)}
              <span class="soluk">/gün</span>
            </span>
          ))}
          {RESOURCE_IDS.filter((r) => def.consumes?.[r]).map((r) => (
            <span key={r} class="uretim-cip azaldi">
              <Ikon ad={r} /> −{fmtInt((def.consumes![r] ?? 0) * rate)}
              <span class="soluk">/gün</span>
            </span>
          ))}
        </div>
      )}
      {!b.built && b.type !== 'rumeli-hisari' && (
        <div class="emirler">
          <Btn
            tur="kirmizi"
            class="emir-btn"
            onClick={() =>
              askConfirm({
                title: 'İnşaat iptal edilsin mi?',
                body: <p>{def.name} inşaatı durdurulur ve kurulum yeri boşaltılır.</p>,
                ok: 'İptal et',
                danger: true,
                onOk: () => {
                  store.dispatch({ t: 'insa-iptal', buildingId: b.id });
                  store.setUi({ selection: [] });
                },
              })
            }
          >
            <Ikon ad="red" />
            <span>İnşaatı iptal et</span>
          </Btn>
        </div>
      )}
    </>
  );
}

const HISAR_KULE: string[] = ['saruca', 'halil', 'zaganos'];

function HisarIhsan({ s, active }: { s: GameState; active: boolean }) {
  const chk = safe(() => edirneActionCheck(s, 'hisar-ihsan'), { ok: false, reason: '', cost: {} });
  return (
    <div class="emirler">
      <Btn
        tur="altin"
        class="emir-btn"
        disabled={active || !chk.ok}
        sesi="onay"
        ipucu={
          <div class="ipucu-icerik genis">
            <div class="ipucu-baslik">Paşalara ihsan vaadi</div>
            <div class="ipucu-metin">Sultan, kulesini önce bitiren paşaya ihsan vaat eder; Saruca, Halil ve Zağanos paşalar yarışa girer, iş hızlanır.</div>
            {!chk.ok && chk.reason && <div class="ipucu-metin kirmizi-yazi">{chk.reason}</div>}
          </div>
        }
        onClick={() => store.dispatch({ t: 'ozel', feature: 'economy', action: 'hisar-ihsan' })}
      >
        <Ikon ad="hazine" />
        <span>{active ? 'İhsan yarışı sürüyor' : 'İhsan vaat et'}</span>
      </Btn>
    </div>
  );
}

// ───────────────────────────── Siege towers ─────────────────────────────

function KuleDurumu({ s, t, kisa }: { s: GameState; t: TowerV; kisa?: boolean }) {
  const can = t.status === 'hazir' || t.status === 'bekliyor';
  const sec = s.sections[t.sectionId];
  return (
    <>
      <div class="secim-izgara">
        {t.status === 'insa' && <BarSatir ad="Yapım" deger={t.progress} tur="ahsap" />}
        {t.status !== 'insa' && t.status !== 'yikildi' && <BarSatir ad="Surlara" deger={t.approach} tur="altin" />}
        {(t.status === 'yaniyor' || t.burn > 0) && <BarSatir ad="Yangın" deger={t.burn} tur="kizgin" />}
        {!kisa && sec && <BarSatir ad="Hendek dolu" deger={sec.moatFill} tur="toprak" isaret={t.moatNeed} />}
      </div>
      {t.blocked && <div class="secim-durum-yazi kirmizi-yazi">{t.blocked}</div>}
      {t.status !== 'yaniyor' && t.status !== 'yikildi' && t.status !== 'surda' && (
        <div class="emirler">
          <Btn
            tur="kirmizi"
            class="emir-btn"
            disabled={!can || !!t.blocked}
            ipucu={<div class="ipucu-icerik">{t.blocked ?? (can ? 'Kuleyi surlara doğru it. Hendek dolmadan geçemez.' : 'Kule zaten ilerliyor.')}</div>}
            onClick={() => store.dispatch({ t: 'kule-ilerlet', sectionId: t.sectionId })}
          >
            <Ikon ad="ozel-kule" />
            <span>{t.status === 'ilerliyor' ? 'İlerliyor…' : 'Kuleyi ilerlet'}</span>
          </Btn>
        </div>
      )}
    </>
  );
}

function KulePaneli({ s, t }: { s: GameState; t: TowerV }) {
  const sec = s.sections[t.sectionId];
  return (
    <>
      <Ust
        ikon={<Ikon ad="ozel-kule" olcek={2} />}
        ad="Kuşatma kulesi"
        alt={sec?.name ?? t.sectionId}
        sag={<span class={`durum kule-${t.status}`}>{t.statusText}</span>}
      />
      <KuleDurumu s={s} t={t} />
      <div class="secim-aciklama">Ahşap iskelet, üstü ıslak öküz derileriyle kaplı; tepesinden surlara köprü iner. Rumlar onu gece barut fıçılarıyla yakmaya çalışır.</div>
    </>
  );
}

// ───────────────────────────── Wall sections ─────────────────────────────

const KIND_ADI: Record<string, string> = { kara: 'Kara surları', halic: 'Haliç surları', marmara: 'Marmara surları' };

function SurPaneli({ s, w, selGroups }: { s: GameState; w: WallSection; selGroups: number[] }) {
  const sdef = SECTION_BY_ID[w.id];
  const siege = s.time.phase === 'kusatma';
  const guns = safe(() => readyCannonsInRange(s, w.id), []);
  const aiming = safe(() => cannonsTargeting(s, w.id), []);
  const lag = pickGroupFor(s, ['lagimci'], null, selGroups);
  const doldur = pickGroupFor(s, ['azap', 'basibozuk'], null, selGroups);
  const kara = w.kind === 'kara';
  const hint = (r: string | null) => (r ? <div class="ipucu-icerik kirmizi-yazi">{r}</div> : undefined);
  const r1 = !siege ? 'Kuşatma başlamadı' : guns.length === 0 ? 'Menzilde hazır top yok' : null;
  const r2 =
    (!siege ? 'Kuşatma başlamadı' : !kara ? 'Yalnızca kara surlarına lağım kazılır' : !lag ? 'Lağımcı birliği yok' : null) ?? (lag ? opt.canDigMine(s, w.id, lag.id) : null);
  const tower = opt.towers(s).find((t) => t.sectionId === w.id && t.status !== 'yikildi') ?? null;
  const r3 =
    (!siege ? 'Kuşatma başlamadı' : !kara ? 'Kule yalnızca kara surlarına yanaştırılır' : s.flags[FLAG.kuleYapildi] && !s.flags[FLAG.kuleYandi] && !opt.towers(s).length ? 'Kule zaten kuruldu' : null) ??
    opt.canBuildTower(s, w.id);
  const moat = kara && siege ? opt.moatWork(s, w.id) : null;
  const free = safe(() => workforceInfo(s).idle, Math.max(0, s.workforce.total - s.workforce.assigned));
  const defText = opt.sectionDefenseText(s, w.id);
  const assault = opt.assaultAt(s, w.id);
  const r4 = !siege ? 'Kuşatma başlamadı' : !kara || !sdef?.moat ? 'Bu kesimde hendek yok' : w.moatFill >= 0.99 ? 'Hendek dolu' : !doldur ? 'Azap ya da başıbozuk birliği yok' : null;
  return (
    <>
      <Ust
        ikon={<Ikon ad="bizans" olcek={2} />}
        ad={w.name}
        alt={
          <>
            {KIND_ADI[w.kind]}
            {sdef?.commander && <span class="soluk"> · Savunan: {sdef.commander}</span>}
          </>
        }
        sag={
          <span class={`gedik-rozet ${w.breach >= 0.5 ? 'acik' : w.breach > 0.2 ? 'catlak' : ''}`}>
            <span class="kucuk">Gedik</span>
            <b class="num">{fmtPct(w.breach)}</b>
          </span>
        }
      />
      {assault && (
        <div class="hucum-kutusu">
          <div class="hucum-baslik">
            <Ikon ad="emir-hucum" /> Hücum sürüyor{assault.wave > 0 && <span class="num"> · {assault.wave}. dalga</span>}
          </div>
          <div class="satir">
            <span class="satir-ad">Tutunma</span>
            <Cubuk deger={assault.foothold} tur="kirmizi" />
            <span class="satir-sayi num">{fmtPct(assault.foothold)}</span>
          </div>
          <div class="kucuk">
            <span class="num">{fmtInt(assault.attackers)}</span> saldıran · <span class="num">{fmtInt(assault.defenders)}</span> savunan · kayıp <span class="num azaldi">{fmtInt(assault.lost)}</span>
          </div>
        </div>
      )}
      {defText && <div class="secim-durum-yazi">{defText}</div>}
      {tower && (
        <div class="kule-kutusu">
          <div class="hucum-baslik">
            <Ikon ad="ozel-kule" /> Kuşatma kulesi · <span class="kucuk">{tower.statusText}</span>
          </div>
          <KuleDurumu s={s} t={tower} kisa />
        </div>
      )}
      <div class="secim-izgara">
        {w.outerMax > 0 && <BarSatir ad="Dış sur" deger={w.outer} max={w.outerMax} tur="tas" />}
        <BarSatir ad={w.outerMax > 0 ? 'İç sur' : 'Sur'} deger={w.inner} max={w.innerMax} tur="tas" />
        {kara && sdef?.moat !== false && <BarSatir ad="Hendek dolu" deger={w.moatFill} tur="toprak" />}
        <BarSatir ad="Barikat" deger={w.barricade} tur="ahsap" />
        <Satir ad="Savunucu">
          <span class="num">≈{fmtInt(Math.round(w.defenders / 50) * 50)}</span>
        </Satir>
        {moat && moat.hasMoat && (
          <div class="satir genis amele-satiri">
            <span class="satir-ad">Hendekte</span>
            <span class="satir-deger">
              <span class="num">{fmtInt(moat.men)}</span> kişi
              <Btn
                tur="kagit"
                class="kare-btn"
                disabled={moat.amele <= 0}
                ipucu={<div class="ipucu-icerik">Ameleyi geri çağır</div>}
                onClick={() => store.dispatch({ t: 'ozel', feature: 'siegeworks', action: 'amele-hendek', payload: { sectionId: w.id, workers: Math.max(0, moat.amele - 200) } })}
              >
                −
              </Btn>
              <span class="num">{fmtInt(moat.amele)}</span>
              <span class="soluk">amele</span>
              <Btn
                tur="kagit"
                class="kare-btn"
                disabled={moat.amele >= moat.ameleMax || free <= 0 || moat.fill >= 0.99}
                ipucu={<div class="ipucu-icerik">Boştaki ameleden 200 kişiyi hendeğe gönder (en çok {fmtInt(moat.ameleMax)}). Okçuların menzilinde kayıp verirler.</div>}
                onClick={() => store.dispatch({ t: 'ozel', feature: 'siegeworks', action: 'amele-hendek', payload: { sectionId: w.id, workers: Math.min(moat.ameleMax, moat.amele + 200) } })}
              >
                +
              </Btn>
            </span>
          </div>
        )}
        <Satir ad="Döven toplar" genis>
          {aiming.length ? (
            <span class="kucuk">
              {aiming
                .slice(0, 4)
                .map((c) => c.name)
                .join(', ')}
              {aiming.length > 4 && ` +${aiming.length - 4}`}
            </span>
          ) : (
            <span class="soluk">yok</span>
          )}
        </Satir>
      </div>
      <div class="emirler">
        <Btn tur="kirmizi" class="emir-btn" disabled={!!r1} ipucu={hint(r1) ?? <div class="ipucu-icerik">{guns.length} hazır top bu kesime çevrilir.</div>} onClick={() => store.dispatch({ t: 'top-hedef', cannonIds: guns.map((c) => c.id), sectionId: w.id })}>
          <Ikon ad="gulle" />
          <span>Topları buraya çevir</span>
        </Btn>
        <Btn tur="lapis" class="emir-btn" disabled={!!r2} ipucu={hint(r2) ?? <div class="ipucu-icerik">{lag?.name} kazmaya başlar.</div>} onClick={() => lag && store.dispatch({ t: 'lagim-kaz', sectionId: w.id, groupId: lag.id })}>
          <Ikon ad="emir-lagim" />
          <span>Lağım kaz</span>
        </Btn>
        <Btn
          tur="lapis"
          class="emir-btn"
          disabled={!!r3 || !!tower}
          ipucu={
            hint(tower ? 'Bu kesimde zaten bir kule var' : r3) ?? (
              <div class="ipucu-icerik">
                Kereste ve ıslak deriyle kaplı kuşatma kulesi kurulur. <span class="maliyet-satir">{fmtCost(opt.towerCost())}</span>
              </div>
            )
          }
          onClick={() => store.dispatch({ t: 'kule-insa', sectionId: w.id })}
        >
          <Ikon ad="ozel-kule" />
          <span>Kule inşa</span>
        </Btn>
        <Btn tur="lapis" class="emir-btn" disabled={!!r4} ipucu={hint(r4) ?? <div class="ipucu-icerik">{doldur?.name} hendeği toprak ve çalı demetiyle doldurur.</div>} onClick={() => doldur && store.dispatch({ t: 'hendek-doldur', sectionId: w.id, groupId: doldur.id })}>
          <Ikon ad="emir-hendek" />
          <span>Hendek doldur</span>
        </Btn>
      </div>
    </>
  );
}

// ───────────────────────────── Ships & mines ─────────────────────────────

function GemiPaneli({ s, sh }: { s: GameState; sh: Ship }) {
  const def = SHIP_TYPES[sh.type];
  return (
    <>
      <Ust
        ikon={<TexIkon tex={def?.icon} yedek="hacli" max={20} />}
        ad={safe(() => shipName(s, sh), def?.name ?? sh.type)}
        alt={
          <>
            {def?.name ?? sh.type} · {SIDE_ADI[sh.side] ?? sh.side}
          </>
        }
        sag={<span class={`durum gemi-${sh.status}`}>{SHIP_STATUS_ADI[sh.status] ?? sh.status}</span>}
      />
      <div class="secim-izgara">
        <BarSatir ad="Gövde" deger={sh.hp} max={sh.hpMax} tur={sh.hp / Math.max(1, sh.hpMax) < 0.35 ? 'kirmizi' : 'ahsap'} metin={`${Math.round(sh.hp)}/${sh.hpMax}`} />
        {def && (
          <Satir ad="Güç">
            <span class="num">{def.power.toFixed(1).replace('.', ',')}</span>
            {def.tall && <span class="etiket"> yüksek bordalı</span>}
          </Satir>
        )}
      </div>
      {sh.side === 'osmanli' && (
        <div class="secim-emir-durum">
          Donanma komutanı: <b>{safe(() => navyCommander(s).name, 'Baltaoğlu Süleyman Bey')}</b>
        </div>
      )}
      {def?.desc && <div class="secim-aciklama">{def.desc}</div>}
      {sh.side === 'osmanli' && <DemirleBtn ships={[sh]} />}
      {sh.side === 'osmanli' && <div class="ipucu-satiri">Sağ tık: gemiyi oraya gönder</div>}
    </>
  );
}

function DemirleBtn({ ships }: { ships: Ship[] }) {
  const ids = ships.filter((x) => x.side === 'osmanli' && x.status !== 'batik' && x.status !== 'karada').map((x) => x.id);
  if (!ids.length) return null;
  return (
    <div class="emirler">
      <Btn
        tur="lapis"
        class="emir-btn"
        ipucu={<div class="ipucu-icerik">Gemiler demir yerlerine (Diplokionion ya da Haliç’teki demirlik) döner.</div>}
        onClick={() => store.dispatch({ t: 'ozel', feature: 'navy', action: 'demirle', payload: ids })}
      >
        <Ikon ad="demir" />
        <span>Demirle</span>
      </Btn>
    </div>
  );
}

function GemilerPaneli({ ships }: { ships: Ship[] }) {
  const byType = new Map<string, number>();
  for (const sh of ships) byType.set(sh.type, (byType.get(sh.type) ?? 0) + 1);
  return (
    <>
      <Ust ikon={<Ikon ad="hacli" />} ad={`${ships.length} gemi`} alt="Filo" />
      <div class="birlik-cipleri">
        {[...byType.entries()].map(([t, n]) => (
          <span key={t} class="cip">
            {SHIP_TYPES[t as Ship['type']]?.name ?? t} <b class="num">×{n}</b>
          </span>
        ))}
      </div>
      <DemirleBtn ships={ships} />
      <div class="ipucu-satiri">Sağ tık: filoyu oraya gönder</div>
    </>
  );
}

function LagimPaneli({ s, m }: { s: GameState; m: Mine }) {
  const sec = s.sections[m.sectionId];
  const v = opt.mine(s, m.id);
  const crew = m.groupId != null ? s.groups.find((g) => g.id === m.groupId) : null;
  return (
    <>
      <Ust
        ikon={<Ikon ad="emir-lagim" olcek={2} />}
        ad={`Lağım — ${sec?.name ?? m.sectionId}`}
        alt={crew ? crew.name : 'Sırp ve Novo Brdo madencileri'}
        sag={<span class={`durum lagim-${m.status}`}>{MINE_STATUS_ADI[m.status] ?? m.status}</span>}
      />
      {v?.statusText && <div class="secim-durum-yazi">{v.statusText}</div>}
      <div class="secim-izgara">
        <BarSatir ad="Tünel" deger={m.progress} tur="toprak" />
        {v?.counter != null && <BarSatir ad="Karşı lağım" deger={v.counter} tur="kirmizi" />}
        <Satir ad="Durum">{m.detected ? <b class="kirmizi-yazi">Bizanslılar fark etti!</b> : <span>Gizli</span>}</Satir>
      </div>
      {m.detected && <div class="secim-aciklama">Johannes Grant’ın adamları kazmaların sesini dinleyip karşı tünel açıyor: duman, ateş ya da çökertme gelebilir.</div>}
      {(v?.canFire ?? m.status === 'hazir') && (
        <div class="emirler">
          <Btn
            tur="kirmizi"
            class="emir-btn"
            sesi="onay"
            ipucu={<div class="ipucu-icerik">Tünelin destek kalasları ateşlenir; tavan çöker ve üstündeki sur oturur.</div>}
            onClick={() => store.dispatch({ t: 'ozel', feature: 'siegeworks', action: 'lagim-atesle', payload: { mineId: m.id } })}
          >
            <Ikon ad="emir-hucum" />
            <span>Destekleri ateşle</span>
          </Btn>
        </div>
      )}
    </>
  );
}

// ───────────────────────────── Router ─────────────────────────────

function resolve(s: GameState, sel: PickResult[]) {
  const groups: UnitGroup[] = [];
  const cannons: Cannon[] = [];
  const ships: Ship[] = [];
  let building: Building | null = null;
  let section: WallSection | null = null;
  let mine: Mine | null = null;
  let tower: TowerV | null = null;
  for (const p of sel) {
    if (p.kind === 'group') {
      const g = s.groups.find((x) => x.id === p.id);
      if (g) groups.push(g);
    } else if (p.kind === 'cannon') {
      const c = s.cannons.find((x) => x.id === p.id);
      if (c) cannons.push(c);
    } else if (p.kind === 'ship') {
      const x = s.ships.find((y) => y.id === p.id);
      if (x) ships.push(x);
    } else if (p.kind === 'building') {
      const b = s.buildings.find((x) => x.id === p.id);
      if (b) building = building ?? b;
      else if (Number(p.id) < 0) tower = tower ?? opt.tower(s, Number(p.id));
    }
    else if (p.kind === 'section') section = section ?? s.sections[String(p.id)] ?? null;
    else if (p.kind === 'mine') mine = mine ?? s.mines.find((x) => x.id === p.id) ?? null;
  }
  return { groups, cannons, ships, building, section, mine, tower };
}

export function Secim() {
  const s = store.state;
  const sel = store.ui.selection;
  if (!s || !sel.length) return null;
  const r = resolve(s, sel);
  let body: ComponentChildren = null;
  let kind = '';
  if (r.groups.length === 1) {
    body = <BirlikPaneli s={s} g={r.groups[0]} />;
    kind = 'birlik';
  } else if (r.groups.length > 1) {
    body = <BirliklerPaneli s={s} groups={r.groups} />;
    kind = 'birlik';
  } else if (r.cannons.length === 1) {
    body = <TopPaneli s={s} c={r.cannons[0]} />;
    kind = 'top';
  } else if (r.cannons.length > 1) {
    body = <ToplarPaneli s={s} cs={r.cannons} />;
    kind = 'top';
  } else if (r.section) {
    body = <SurPaneli s={s} w={r.section} selGroups={[]} />;
    kind = 'sur';
  } else if (r.tower) {
    body = <KulePaneli s={s} t={r.tower} />;
    kind = 'kule';
  } else if (r.building) {
    body = <YapiPaneli s={s} b={r.building} />;
    kind = 'yapi';
  } else if (r.ships.length === 1) {
    body = <GemiPaneli s={s} sh={r.ships[0]} />;
    kind = 'gemi';
  } else if (r.ships.length > 1) {
    body = <GemilerPaneli ships={r.ships} />;
    kind = 'gemi';
  } else if (r.mine) {
    body = <LagimPaneli s={s} m={r.mine} />;
    kind = 'lagim';
  }
  if (!body) return null;
  const key = sel.map((p) => `${p.kind}${p.id}`).join(',');
  return (
    <div key={key} class={`secim panel-kagit etkilesim secim-${kind}`}>
      <span class="secim-isaret" />
      {body}
    </div>
  );
}

