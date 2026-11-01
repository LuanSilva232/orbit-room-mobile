export type ApiConfiguration = {
  baseUrl: string | null;
  error: string | null;
};

function resolveApiConfiguration(
  value: string | undefined,
  variableName: string
): ApiConfiguration {
  const configuredUrl = value?.trim();

  if (!configuredUrl) {
    return {
      baseUrl: null,
      error: `Configure ${variableName} no arquivo .env da pasta mobile-adaptation.`,
    };
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    return { baseUrl: null, error: 'A URL da API não é válida.' };
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '10.0.2.2']);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHosts.has(url.hostname))) {
    return {
      baseUrl: null,
      error: 'Use uma URL HTTPS para o servidor da API.',
    };
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    return {
      baseUrl: null,
      error: 'Informe somente a URL principal do servidor, sem caminho ou credenciais.',
    };
  }

  return { baseUrl: url.origin, error: null };
}

const apiConfiguration = resolveApiConfiguration(
  process.env.EXPO_PUBLIC_API_URL,
  'EXPO_PUBLIC_API_URL'
);
const authApiConfiguration = resolveApiConfiguration(
  process.env.EXPO_PUBLIC_AUTH_API_URL?.trim() || process.env.EXPO_PUBLIC_API_URL,
  'EXPO_PUBLIC_AUTH_API_URL ou EXPO_PUBLIC_API_URL'
);

export function getApiConfiguration(): ApiConfiguration {
  return apiConfiguration;
}

export function getAuthApiConfiguration(): ApiConfiguration {
  return authApiConfiguration;
}
