export function downloadText(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(name: string, data: unknown) {
  downloadText(name, JSON.stringify(data, null, 2), 'application/json');
}

export function fileSafe(name: string, fallback = 'auto') {
  return name.replace(/[\\/:*?"<>|]+/g, '').trim() || fallback;
}
