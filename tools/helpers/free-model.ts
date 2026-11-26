// Registers only the Bash.tv free model, the same way the live session's bridge does, so
// headless helper bots (`pi -p`) can run without the bridge extension (which would attach to
// the live session). Used by tools/helpers/run.sh.
import { buildFreeProviderConfig, parseFreeModelInfo } from '/home/bashtv/.pi/agent/extensions/ws-bridge/freeLlmProvider.ts';
import { buildAppCallbackAuthHeaders } from '/home/bashtv/.pi/agent/extensions/ws-bridge/tunnelAuth.ts';

export default function (pi: { registerProvider(name: string, config: unknown): void }) {
  const url = process.env.BASHTV_FREE_LLM_URL?.trim();
  if (!url) throw new Error('No BASHTV_FREE_LLM_URL in this sandbox');
  pi.registerProvider(
    'bashtv',
    buildFreeProviderConfig({
      baseUrl: url,
      apiKey: 'API_REFRESH_TOKEN',
      headers: buildAppCallbackAuthHeaders(),
      modelInfo: parseFreeModelInfo(process.env.BASHTV_FREE_MODEL_INFO),
    }),
  );
}
