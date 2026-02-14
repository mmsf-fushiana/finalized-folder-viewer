import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme, routes } from '@ssr3-viewer/ui';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
const router = createBrowserRouter(routes, { basename });

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
