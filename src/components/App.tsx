import { useEffect, useState } from "preact/hooks";

interface AppProps {
  initialData: string;
  filePath: string;
  onDataChange: (data: string) => void;
}

export function App({ initialData, filePath, onDataChange }: AppProps) {
  return (
    <div class="tablite-container">
      <p>Tablite: {filePath}</p>
      <p>Data length: {initialData.length} chars</p>
    </div>
  );
}
