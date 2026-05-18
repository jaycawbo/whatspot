import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { GlobalStateProvider } from '@/context/GlobalStateContext';
import { BroncoProvider } from '@/context/BroncoContext';
import RequestModal from '@/components/bronco/RequestModal';
import FloatingRequestsPill from '@/components/bronco/FloatingRequestsPill';
import RequestsOverlay from '@/components/bronco/RequestsOverlay';
import VenueDetails from '@/pages/VenueDetails';
import VenuePortal from '@/pages/VenuePortal';
import EnrichmentDashboard from '@/pages/EnrichmentDashboard';
import Credits from '@/pages/Credits';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : () => <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      <Route path="/venue/:placeId" element={<VenueDetails />} />
      <Route path="/portal/:venueId" element={<VenuePortal />} />
      <Route path="/enrich" element={<EnrichmentDashboard />} />
      <Route path="/credits" element={<Credits />} />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  return (
    <AuthProvider>
      <GlobalStateProvider>
        <BroncoProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <AuthenticatedApp />
            </Router>
            <RequestModal />
            <FloatingRequestsPill />
            <RequestsOverlay />
            <Toaster />
          </QueryClientProvider>
        </BroncoProvider>
      </GlobalStateProvider>
    </AuthProvider>
  )
}

export default App
