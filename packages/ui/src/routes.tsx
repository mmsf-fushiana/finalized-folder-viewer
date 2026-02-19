import { Navigate } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { DesktopHome } from './pages/DesktopHome';
import { MonitorPage } from './pages/MonitorPage';
import { Health } from './pages/Health';
import { Settings } from './pages/Settings';
import { FolderDetail } from './pages/FolderDetail';
import { AppLayout } from './layouts/AppLayout';
import { TwoPaneLayout } from './layouts/TwoPaneLayout';
import { isDesktop } from './hooks';
import { loadFinalizationData, loadGAList } from './data';

const finalizationData = loadFinalizationData();
const gaList = loadGAList();

const desktopRoot: RouteObject = {
  path: '/',
  element: <AppLayout />,
  children: [
    { index: true, element: <DesktopHome /> },
    { path: 'monitor/:version', element: <MonitorPage /> },
    { path: ':version/:level', element: <FolderDetail /> },
    { path: 'settings', element: <Settings /> },
  ],
};

const webRoot: RouteObject = {
  path: '/',
  element: <TwoPaneLayout finalizationData={finalizationData} gaList={gaList} />,
  children: [
    { index: true, element: <Navigate to="/BA/1" replace /> },
    { path: ':version/:level', element: <FolderDetail /> },
  ],
};

export const routes: RouteObject[] = [
  isDesktop() ? desktopRoot : webRoot,
  {
    path: '/health',
    element: <AppLayout />,
    children: [
      { index: true, element: <Health /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
];
