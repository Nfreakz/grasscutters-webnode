export const siteConfig = {
  name: 'GrassCutters Racing',
  shortName: 'GrassCutters',
  navigation: [
    { label: 'Inicio', href: '/' },
    { label: 'Campeonatos', href: '/campeonatos/' },
    { label: 'App', href: '/app/' },
    { label: 'SR / DS', href: '/ratings/' },
    { label: 'Equipos', href: '/equipos/' }
  ],
  servers: [
    {
      key: 'weekly',
      name: 'Liga GrassCutters',
      championshipName: 'Liga GrassCutters',
      accent: 'lime',
      joinUrl: 'https://acstuff.ru/s/q:race/online/join?httpPort=8381&ip=145.239.131.153',
      signupUrl: 'http://145.239.131.153:8840/championship/ad89ce26-0206-40f2-adec-451cf221d4e6/sign-up/steam'
    },
    {
      key: 'gt4',
      name: 'Supra GT4',
      championshipName: 'Supra GT4',
      accent: 'teal',
      joinUrl: 'https://acstuff.ru/s/q:race/online/join?httpPort=8381&ip=5.39.68.161',
      signupUrl: 'http://5.39.68.161:8840/championship/bef21906-b596-4514-aebb-7235ec02bd50/sign-up/steam'
    }
  ]
} as const;
