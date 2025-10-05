import { createTheme } from '@mui/material/styles';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#202020',
      paper: '#242424',
    },
    primary: {
      main: '#1e73ff', // MRC blue
    },
    // Map success to primary so any success usage (e.g. Alert severity="success") adopts the same blue
    success: {
      main: '#1e73ff',
      contrastText: '#ffffff'
    },
  },
  components: {
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            height: '40px',
          },
        },
      },
    },
    MuiFormControl: {
        styleOverrides: {
            root: {
                '& .MuiOutlinedInput-root': {
                    height: '40px',
                }
            }
        }
    },
    MuiAlert: {
      styleOverrides: {
        standardSuccess: {
          backgroundColor: '#1e73ff',
          color: '#ffffff',
        },
        filledSuccess: {
          backgroundColor: '#1e73ff',
          color: '#ffffff',
        },
        outlinedSuccess: {
          color: '#1e73ff',
          borderColor: '#1e73ff',
        },
      }
    }
  },
});