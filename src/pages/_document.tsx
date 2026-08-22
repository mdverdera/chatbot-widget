import React from 'react';
import type { DocumentProps } from 'next/document';
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document(_props: DocumentProps) {
  return (
    <Html
      lang="en"
      style={{ background: 'transparent', overflow: 'visible' }}
    >
      <Head />
      <body style={{ background: 'transparent', margin: 0, padding: 0, overflow: 'visible' }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}