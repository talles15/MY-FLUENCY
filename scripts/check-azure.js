#!/usr/bin/env node
/**
 * Confere se AZURE_SPEECH_KEY e AZURE_SPEECH_REGION funcionam, sem gastar áudio:
 * pede um token temporário ao Azure (é o mesmo teste de "chave e região batem?").
 *   npm run check:azure
 */
import { config } from "../server/config.js";

const { azureKey: key, azureRegion: region } = config;
if (!key || !region) {
  console.error("Preencha AZURE_SPEECH_KEY e AZURE_SPEECH_REGION no .env.");
  process.exit(1);
}
if (/\s|[A-Z]/.test(region)) console.warn(`Aviso: a região "${region}" parece um nome de exibição. Use o código, ex.: eastus, brazilsouth.`);

const url = `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
try {
  const r = await fetch(url, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": key, "Content-Length": "0" } });
  if (r.ok) {
    console.log(`OK: a chave funciona na região ${region}.`);
  } else if (r.status === 401) {
    console.error(`Recusado (401): a chave não vale para a região "${region}". Confira em Keys and Endpoint → Location/Region.`);
    process.exit(1);
  } else {
    console.error(`O Azure respondeu ${r.status}: ${await r.text()}`);
    process.exit(1);
  }
} catch (e) {
  console.error(`Não consegui falar com ${url}: ${e.message}. A região existe?`);
  process.exit(1);
}
