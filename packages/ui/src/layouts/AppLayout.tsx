import { Outlet } from 'react-router-dom';
import { Box } from '@mui/material';

export function AppLayout() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: "rgb(60,90,99)" }}>
        {/* 
        
        rgb(49,74,90)
        rgb(181,33,57)
        */}
        
      {/* <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Finalized Folder Viewer
          </Typography>
          <Button color="inherit" component={RouterLink} to="/">
            Home
          </Button>
          <Button color="inherit" component={RouterLink} to="/settings">
            Settings
          </Button>
        </Toolbar>
      </AppBar> */}
      <Box component="main" sx={{ flex: 1 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
