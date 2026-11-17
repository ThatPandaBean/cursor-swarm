import './globals.css';

export const metadata = {
  title: 'Cursor Swarm',
  description: 'A spreadsheet that ten named agent cursors fill in live.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
