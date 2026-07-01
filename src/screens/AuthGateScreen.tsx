import { useState } from 'react';
import { LoginScreen } from './LoginScreen';
import { OnboardingStartScreen } from './OnboardingStartScreen';
import { PaymentScreen } from './PaymentScreen';
import { OnboardingSuccessScreen } from './OnboardingSuccessScreen';

type Step =
  | { name: 'login' }
  | { name: 'onboarding' }
  | {
      name: 'payment';
      coupleId: string;
      checkoutToken: string;
      ownerName: string;
      partnerName: string;
      shipName: string;
    }
  | { name: 'success'; ownerName: string; partnerName: string };

// Everything shown before any session exists: normal login, or the
// self-serve onboarding wizard (start -> dummy payment -> "check your
// email"). No navigation library in this app, so this is a tiny local
// state machine rather than a router.
export function AuthGateScreen() {
  const [step, setStep] = useState<Step>({ name: 'login' });

  if (step.name === 'onboarding') {
    return (
      <OnboardingStartScreen
        onStarted={(result) => setStep({ name: 'payment', ...result })}
        onBackToLogin={() => setStep({ name: 'login' })}
      />
    );
  }

  if (step.name === 'payment') {
    return (
      <PaymentScreen
        coupleId={step.coupleId}
        checkoutToken={step.checkoutToken}
        ownerName={step.ownerName}
        partnerName={step.partnerName}
        shipName={step.shipName}
        onPaid={() => setStep({ name: 'success', ownerName: step.ownerName, partnerName: step.partnerName })}
        onBack={() => setStep({ name: 'onboarding' })}
      />
    );
  }

  if (step.name === 'success') {
    return (
      <OnboardingSuccessScreen
        ownerName={step.ownerName}
        partnerName={step.partnerName}
        onBackToLogin={() => setStep({ name: 'login' })}
      />
    );
  }

  return <LoginScreen onStartOnboarding={() => setStep({ name: 'onboarding' })} />;
}
