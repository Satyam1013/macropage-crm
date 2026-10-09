import { parseOrigins } from './app.setup';

describe('parseOrigins', () => {
  it('keeps only scheme + host + port of each entry', () => {
    expect(
      parseOrigins(
        ' http://localhost:5173 , https://macropage-crm-kj4z.vercel.app/login,https://x.dev/ ,',
      ),
    ).toEqual(['http://localhost:5173', 'https://macropage-crm-kj4z.vercel.app', 'https://x.dev']);
  });
});
