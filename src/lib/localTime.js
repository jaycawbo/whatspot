// The user's local day (0 = Sunday) and minutes since midnight, sent to edge functions
// so open-now is judged by the user's clock rather than the server's UTC one (#385).
export function getLocalDayAndMinutes(now = new Date()) {
  return { day: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
}
