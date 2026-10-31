/** @type {import('tailwindcss').Config} */
module.exports = {
  // Avisa ao Tailwind para ler os estilos de todos os arquivos dentro do seu projeto
  content: ["./App.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./app/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0b0f1f', // O fundo escuro do seu Orbit Room original
        }
      }
    },
  },
  plugins: [],
}
