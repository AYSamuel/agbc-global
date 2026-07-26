/** AUTH-2's sent-to indicator (docs/spec/03): "a•••@gmail.com". */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return email;
  return `${email.charAt(0)}•••${email.slice(at)}`;
}
