// datetime-local controls display the viewer's local time; API filters retain
// explicit instants. Preserve seconds/milliseconds when a saved view has them.
export function responseFilterLocalTime(value: string | null) {
  if (!value || !/^\d{4}-/.test(value)) return "";
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() < 1 ||
    date.getFullYear() > 9999
  )
    return "";
  const part = (number: number, length = 2) =>
    String(number).padStart(length, "0");
  return `${part(date.getFullYear(), 4)}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}${date.getMilliseconds() ? "." + part(date.getMilliseconds(), 3) : ""}`;
}
