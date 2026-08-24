export const ENGLISH_SPEAKING_QUESTIONS = [
  "Tell us about yourself and the kind of work you have done before.",
  "Describe a difficult work or study problem you solved. What did you do?",
  "Why are you interested in this role, and what would make you successful here?",
  "Tell us about a time you had to explain something clearly to another person.",
];

export const ENGLISH_SPEAKING_MIN_SECONDS = 120;
export const ENGLISH_SPEAKING_MAX_SECONDS = 240;
export const ENGLISH_SPEAKING_MAX_BYTES = 50 * 1024 * 1024;
export const ENGLISH_SPEAKING_MIME_TYPES = ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "video/webm"];

export function normalizeSpeakingMime(value: string) {
  return value.trim().toLowerCase().split(";", 1)[0];
}

export function isSpeakingMimeAllowed(value: string) {
  return ENGLISH_SPEAKING_MIME_TYPES.includes(normalizeSpeakingMime(value));
}
