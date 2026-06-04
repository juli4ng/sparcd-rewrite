import { useEffect } from 'react';
import { Connection } from '@sparcd/auth-ui';
import { useStore } from './store';
import { Chrome } from './components/Chrome';
import { Browse } from './sections/Browse';
import { Settings } from './sections/Settings';
import { Placeholder } from './sections/Placeholder';

// Dev-only, non-secret prefill (endpoint only). Secrets are never prefilled.
const devEndpoint = import.meta.env.VITE_SPARCD_S3_ENDPOINT as string | undefined;

export function App() {
  const s3Config = useStore((s) => s.s3Config);
  const section = useStore((s) => s.section);
  const connect = useStore((s) => s.connect);
  const theme = useStore((s) => s.theme);
  const selectedUploadPrefix = useStore((s) => s.selectedUploadPrefix);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  if (!s3Config) {
    return (
      <Connection
        toolName="Tagger"
        initialConfig={devEndpoint ? { endpoint: devEndpoint } : undefined}
        onConnect={connect}
      />
    );
  }

  return (
    <Chrome>
      {section === 'browse' && <Browse />}
      {section === 'tag' &&
        (selectedUploadPrefix ? (
          <Placeholder title="Tag workspace" phase="P1 – P3">
            Single-image tagging, bursts, and batch tagging land here. The upload is loaded and ready.
          </Placeholder>
        ) : (
          <Placeholder title="Tag workspace" phase="P1 – P3">
            Choose an upload in Browse to start tagging.
          </Placeholder>
        ))}
      {section === 'history' && (
        <Placeholder title="History" phase="P5 – P6">
          Sync history and the snapshot/version recovery view appear here.
        </Placeholder>
      )}
      {section === 'settings' && <Settings />}
    </Chrome>
  );
}
