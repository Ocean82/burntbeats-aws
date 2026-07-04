interface LocalDevClerkResources {
  client: {
    id: string;
    sessions: Array<typeof localDevSession>;
    signIn: null;
    signUp: null;
  };
  session: typeof localDevSession;
  user: typeof localDevUser;
  organization: null;
}

type ClerkResourceListener = (resources: LocalDevClerkResources) => void;

const localDevUser = {
  id: "user_local_dev",
  fullName: "Local Dev",
  firstName: "Local",
  lastName: "Dev",
  imageUrl: "",
  primaryEmailAddress: { emailAddress: "local-dev@burntbeats.test" },
  publicMetadata: {},
  unsafeMetadata: { planPickerSeen: true },
  update: async () => localDevUser,
};

const localDevSession = {
  id: "sess_local_dev",
  status: "active",
  user: localDevUser,
  getToken: async () => null,
};

const localDevResources: LocalDevClerkResources = {
  client: {
    id: "client_local_dev",
    sessions: [localDevSession],
    signIn: null,
    signUp: null,
  },
  session: localDevSession,
  user: localDevUser,
  organization: null,
};

const listeners = new Set<ClerkResourceListener>();

function emitLocalDevResources() {
  for (const listener of listeners) listener(localDevResources);
}

function mountLocalDevUserButton(node: HTMLDivElement) {
  node.textContent = "";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Account";
  button.setAttribute("aria-label", "Account");
  node.appendChild(button);
}

export const localDevClerk = {
  loaded: true,
  status: "ready",
  isSignedIn: true,
  client: localDevResources.client,
  session: localDevSession,
  user: localDevUser,
  organization: null,
  __internal_lastEmittedResources: localDevResources,
  telemetry: { record: () => {} },
  load: async () => {
    emitLocalDevResources();
  },
  addListener: (listener: ClerkResourceListener) => {
    listeners.add(listener);
    listener(localDevResources);
    return () => listeners.delete(listener);
  },
  on: (event: string, listener: (status: string) => void) => {
    if (event === "status") listener("ready");
    return () => {};
  },
  off: () => {},
  signOut: async () => {},
  openUserProfile: () => {},
  closeUserProfile: () => {},
  openSignIn: () => {},
  closeSignIn: () => {},
  openSignUp: () => {},
  closeSignUp: () => {},
  mountUserButton: mountLocalDevUserButton,
  unmountUserButton: (node: HTMLDivElement) => {
    node.textContent = "";
  },
};
