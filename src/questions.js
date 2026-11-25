/**
 * Perguntas do app (em inglês) com o tipo de tarefa que cada uma exige.
 * Compartilhado entre o front-end e o servidor (o servidor valida taskType e o teste de nível).
 */

export const TASK_TYPES = ["describe", "narrate", "opinion", "argument"];

export const TASK_LABELS = {
  describe: "Descrever",
  narrate: "Narrar",
  opinion: "Opinar",
  argument: "Argumentar",
};

/** Conversa livre: por tema e faixa (A = A1–A2, B = B1–B2, C = C1–C2). */
export const TOPICS = {
  "Apresentação pessoal": {
    A: [
      { q: "Hi! Tell me about yourself. Where are you from, and what is your city like?", taskType: "describe" },
      { q: "What did you do last weekend?", taskType: "narrate" },
    ],
    B: [
      { q: "Tell me a little about yourself. What do you do, and what do you enjoy about it?", taskType: "describe" },
      { q: "Tell me about a moment that changed the way you see things.", taskType: "narrate" },
    ],
    C: [
      { q: "How would your closest friends describe you, and do you think they'd be right?", taskType: "opinion" },
      { q: "Some people say personality is fixed by the age of thirty. Do you agree? Argue your case.", taskType: "argument" },
    ],
  },
  "Rotina e trabalho": {
    A: [
      { q: "Describe a normal day for you, from morning to night.", taskType: "describe" },
      { q: "What did you do at work or school yesterday?", taskType: "narrate" },
    ],
    B: [
      { q: "What does a typical workday look like for you?", taskType: "describe" },
      { q: "Is it better to work from home or in an office? Why?", taskType: "opinion" },
    ],
    C: [
      { q: "If you could redesign your working week from scratch, what would you change and why?", taskType: "opinion" },
      { q: "Should a four-day working week become the law? Make the case for or against it.", taskType: "argument" },
    ],
  },
  "Viagens": {
    A: [
      { q: "Describe a place you like to visit. What can you see and do there?", taskType: "describe" },
      { q: "Tell me about your last vacation. Where did you go?", taskType: "narrate" },
    ],
    B: [
      { q: "Tell me about a trip you really enjoyed. What made it special?", taskType: "narrate" },
      { q: "Is it better to travel alone or with friends? Explain your view.", taskType: "opinion" },
    ],
    C: [
      { q: "Some people say travel broadens the mind. Do you agree, or is that overstated?", taskType: "argument" },
      { q: "Should cities limit the number of tourists? Weigh up both sides.", taskType: "argument" },
    ],
  },
  "Comida": {
    A: [
      { q: "What is your favorite food? Describe it.", taskType: "describe" },
      { q: "What did you eat yesterday? Tell me about your meals.", taskType: "narrate" },
    ],
    B: [
      { q: "What's a typical dish from your region, and how is it made?", taskType: "describe" },
      { q: "Should schools teach children how to cook? Why or why not?", taskType: "opinion" },
    ],
    C: [
      { q: "How has the way people eat changed in your country over the last twenty years?", taskType: "describe" },
      { q: "Should governments tax sugary food and drinks? Argue for or against.", taskType: "argument" },
    ],
  },
  "Tecnologia": {
    A: [
      { q: "Describe your phone. What apps do you use every day?", taskType: "describe" },
      { q: "Tell me about the first time you used the internet.", taskType: "narrate" },
    ],
    B: [
      { q: "How has technology changed the way you study or work?", taskType: "narrate" },
      { q: "Do you think children should have smartphones? Why?", taskType: "opinion" },
    ],
    C: [
      { q: "Should governments regulate artificial intelligence more strictly? What would you propose?", taskType: "argument" },
      { q: "Is social media doing more harm than good? Defend your position.", taskType: "argument" },
    ],
  },
};

export const bandOf = (level) => (level || "B1")[0];

/**
 * Teste de nível: 3 perguntas de tipos diferentes, nesta ordem, subindo de dificuldade.
 * Cada resposta precisa de pelo menos 40 palavras para contar (regra do motor).
 */
export const PLACEMENT_TEST = [
  {
    taskType: "describe",
    q: "Describe the place where you live. What is it like, and what do you like or dislike about it? Please speak for about one minute.",
  },
  {
    taskType: "narrate",
    q: "Tell me about a memorable trip or experience you had. What happened, and how did you feel about it? Please speak for about one minute.",
  },
  {
    taskType: "argument",
    q: "Some people believe working from home makes people more productive, while others think it harms teamwork. What is your position? Give reasons and examples.",
  },
];

/** Frases para a aba Pronúncia (leitura em voz alta). */
export const SENTENCES = {
  A1: ["I like coffee in the morning.", "My sister lives in a big city.", "Can you help me, please?", "We have English class on Monday."],
  A2: ["I usually take the bus to work, but today I walked.", "Could you tell me where the nearest pharmacy is?", "Last weekend we visited my grandparents in the countryside.", "I'd like a table for two, please."],
  B1: ["I've been learning English for three years, and I still enjoy it.", "If it rains tomorrow, we'll have to cancel the picnic.", "The weather was so unpredictable that we changed our plans twice.", "She thought the movie was better than the book."],
  B2: ["Although the project was challenging, the team managed to deliver it on schedule.", "I would have called you earlier if I'd known about the change.", "Regular exercise significantly reduces the risk of several chronic diseases.", "The thoroughly rehearsed presentation impressed everyone in the room."],
  C1: ["Notwithstanding the initial setbacks, the negotiations ultimately reached a constructive outcome.", "Her argument, while thought-provoking, rests on a number of questionable assumptions.", "The phenomenon is particularly prevalent among rural communities in the northern provinces.", "It's worth thoroughly reconsidering whether this approach is genuinely sustainable."],
  C2: ["The committee's deliberations were characterised by an unusual degree of candour and mutual respect.", "Ostensibly a comedy, the play is in fact a scathing indictment of bureaucratic indifference.", "His idiosyncratic phrasing occasionally obscures what is otherwise an exceptionally lucid thesis.", "Few anticipated the extraordinarily rapid proliferation of the technology across rural regions."],
};
