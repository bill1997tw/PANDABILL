const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateJoinCode(length = 6) {
  let code = "";

  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * ALPHABET.length);
    code += ALPHABET[randomIndex];
  }

  return code;
}
