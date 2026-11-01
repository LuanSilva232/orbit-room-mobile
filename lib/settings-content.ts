export const WEBSITE_ABOUT = {
  version: 'v0.65',
  date: 'Ago 2026',
  introduction:
    'O Orbit Room é uma plataforma de conversas ao vivo em voz e vídeo, criada para aproximar pessoas e reunir todo mundo em salas compartilhadas em tempo real — não importa a distância.',
  heading: 'Por que o Orbit Room existe?',
  explanation:
    'Estamos sempre conectados, mas muitas vezes distantes. O Orbit Room nasceu para devolver ao mundo digital o calor de uma conversa cara a cara: um lugar simples em que basta entrar numa sala para se sentir junto de verdade.',
  principles: [
    'Reunir pessoas ao redor de uma conversa viva, sem fricção',
    'Trazer de volta a sensação de “estar na mesma sala”, de qualquer lugar',
    'Tornar as conversas reais acessíveis e naturais para todos',
  ],
  closing:
    'Mais do que um aplicativo de chamadas, é um espaço de presença e conexão — feito para quem quer conversar, e não apenas conectar.',
  credits: 'Criado por Noah · v0.65',
} as const;

export type WebsiteUpdateTag = 'novo' | 'correcao' | 'melhoria';

export const WEBSITE_CHANGELOG: {
  version: string;
  date: string;
  items: { tag: WebsiteUpdateTag; text: string }[];
}[] = [
  {
    version: 'v0.65',
    date: 'Ago 2026',
    items: [
      { tag: 'novo', text: 'Fixar até 3 câmeras na tela cheia, com a sua como a principal.' },
      { tag: 'novo', text: 'Câmeras fixadas lado a lado na tela cheia, em retrato e em paisagem.' },
      { tag: 'melhoria', text: 'Tela cheia mostra uma câmera por vez até você fixar alguém.' },
      { tag: 'correcao', text: 'Botão de fixar no lugar certo: na aba Câmeras, somente no computador.' },
      { tag: 'melhoria', text: 'Detecção de aparelho (celular ou computador) para controlar quem fixa câmeras.' },
    ],
  },
  {
    version: 'v0.6',
    date: 'Ago 2026',
    items: [
      { tag: 'novo', text: 'Nova página de Atualizações no menu de configurações.' },
      { tag: 'melhoria', text: 'Entrar nas salas com o microfone ligado por padrão (modo silencioso continua disponível).' },
      { tag: 'melhoria', text: 'Cada versão agora mostra a data de quando foi lançada.' },
      { tag: 'correcao', text: 'Microfone mais estável ao ligar e desligar durante a chamada.' },
    ],
  },
  {
    version: 'v0.5',
    date: 'Ago 2026',
    items: [
      { tag: 'novo', text: 'Virar a câmera entre frontal e traseira no celular.' },
      { tag: 'novo', text: 'Modo silencioso para entrar nas salas sem ativar o microfone.' },
      { tag: 'correcao', text: 'Câmera não pisca mais ao ligar e desligar em sequência.' },
      { tag: 'correcao', text: 'Vídeo do outro lado sempre na posição correta, em qualquer aparelho.' },
      { tag: 'melhoria', text: 'Microfone liga e desliga na hora, sem limite.' },
    ],
  },
  {
    version: 'v0.4',
    date: 'Jul 2026',
    items: [
      { tag: 'novo', text: 'Compartilhar a tela com áudio para os participantes.' },
      { tag: 'novo', text: 'Salas privadas com senha e convites.' },
      { tag: 'melhoria', text: 'Conversas do chat salvas por canal.' },
      { tag: 'correcao', text: 'Som com menos eco e ruído de fundo.' },
    ],
  },
  {
    version: 'v0.3',
    date: 'Jun 2026',
    items: [
      { tag: 'novo', text: 'Entrar com a conta do Google.' },
      { tag: 'novo', text: 'Lista de amigos e de quem está online.' },
      { tag: 'novo', text: 'Perfil com nome, foto e bio.' },
      { tag: 'melhoria', text: 'Visual reformulado para celular e computador.' },
    ],
  },
];
