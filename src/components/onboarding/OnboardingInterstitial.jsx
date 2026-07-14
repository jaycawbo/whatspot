import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOnboardingFlow } from '@/hooks/useOnboardingFlow';
import OnboardingMobile from './OnboardingMobile';
import OnboardingDesktop from './OnboardingDesktop';

export default function OnboardingInterstitial() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const isMobile = useIsMobile();
  const { isOpen, screenIndex, next, goTo, close } = useOnboardingFlow();

  const shouldRender = isOpen && !isLoadingAuth && !isAuthenticated;
  const Variant = isMobile ? OnboardingMobile : OnboardingDesktop;

  return (
    <AnimatePresence>
      {shouldRender && (
        <Variant key="onboarding" screenIndex={screenIndex} onNext={next} onDotClick={goTo} onClose={close} />
      )}
    </AnimatePresence>
  );
}
