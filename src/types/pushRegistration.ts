export type PushRegistrationStatus =
  | 'idle'
  | 'registering'
  | 'saved'
  | 'permission_denied'
  | 'not_device'
  | 'no_project_id'
  | 'no_session'
  | 'token_failed'
  | 'save_failed'
  | 'verify_failed';

export type PushRegistrationState = {
  status: PushRegistrationStatus;
  message: string | null;
  tokenPrefix: string | null;
};

export const PUSH_REGISTRATION_IDLE: PushRegistrationState = {
  status: 'idle',
  message: null,
  tokenPrefix: null,
};
