// Main exports for @vitalpoint/nft-course-access

// Client components
export { PurchaseWidget } from './client/components/PurchaseWidget';
export { AccessGate } from './client/components/AccessGate';
export { CourseAccessProvider } from './client/context/CourseAccessProvider';

// Client hooks
export { useNFTAccess } from './client/hooks/useNFTAccess';
export { usePurchase } from './client/hooks/usePurchase';

// Types
export type {
  CoursePackage,
  AccessPass,
  AccessType,
  PaymentMethod,
  PurchaseWidgetProps,
  AccessGateProps,
} from './types';
