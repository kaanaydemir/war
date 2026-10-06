/** PUBLIC API of audio (owner: audio agent). UI sound hooks. */
export type UiSound = 'tik' | 'ac' | 'kapat' | 'hata' | 'onay' | 'sayfa';
export function playUi(kind: UiSound): void {}
