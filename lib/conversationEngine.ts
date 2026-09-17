// This is a scripted preview of how the conversation could flow — not the real
// AI brain yet. It exists so a client can hear tone, pacing, and language
// switching before the agent is connected to a live model. Once Sarvam is
// wired in, this function is what gets replaced by a real model call.

export function nextAgentLine(turn: number, lastCallerText: string): string {
  const text = lastCallerText.toLowerCase();

  if (/budget|fee|cost|price|expensive|emi/.test(text)) {
    return "I understand — cost is an important factor. I can have one of our counsellors call you back with the EMI options available. Would that help?";
  }
  if (/book|yes|interested|sounds good|ready|sign up|enroll/.test(text)) {
    return "Wonderful. I'll go ahead and note you down for a counselling session with our team. Someone will confirm the timing with you shortly.";
  }
  if (/not interested|no thanks|busy|call later|not now/.test(text)) {
    return "No problem at all — I'll make a note not to disturb you again this week. Have a good day.";
  }

  const scripted = [
    "Could you tell me which exam you're preparing for, and which attempt this would be?",
    "Got it, thank you. And are you currently attending any coaching, or exploring options?",
    "That's helpful to know. Is there a particular centre or city you'd prefer for classes?",
  ];
  return scripted[Math.min(turn, scripted.length - 1)];
}
