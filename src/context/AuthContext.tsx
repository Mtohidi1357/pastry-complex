import { 
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode
} from "react";
import { useRouter } from "next/router";

import type { LoggedInUser } from "@/features/auth/authTypes";
import {
  useStoredValue,
  notifyAuthChange,
} from "@/hooks/useStoredValue";

type User = {
  id: number;
  username: string;
  role: string;
};

type AuthContextType = {
  user: LoggedInUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function AuthProvider({ children }: { children: ReactNode }) {
  // const [user, setUser] = useState<User | null>(null);
  // const [token, setToken] = useState<string | null>(null);
  // const [loading, setLoading] = useState(true);
  const router = useRouter();
  const token = useStoredValue("token");
  const storedUser = useStoredValue("user");
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientSnapshot,
    serverSnapshot,
  );

  let user: LoggedInUser | null = null;

  if (token && storedUser) {
    try {
      user = JSON.parse(storedUser) as LoggedInUser;
    } catch {
      // Ignore invalid stored user data.
    }
  }
  // useEffect(() => {
  //   const storedToken = localStorage.getItem("token");
  //   const storedUser = localStorage.getItem("user");
  //   if (storedToken && storedUser) {
  //     setToken(storedToken);
  //     setUser(JSON.parse(storedUser));
  //   }
  //   setLoading(false);
  // }, []);

  const login = async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const response = await res.json();

    if (!res.ok || !response.success) {
      throw new Error(response.error?.message ?? "Login failed");
    }

    const session = response.data?.token;

    if (typeof session?.token !== "string" || !session.user) {
      throw new Error("Invalid login response.");
    }

    localStorage.setItem("token", session.token);
    localStorage.setItem("user", JSON.stringify(session.user));
    document.cookie = `token=${session.token}; path=/; max-age=86400; SameSite=Lax`;
    notifyAuthChange();
    router.push("/dashboard/inbox");
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    document.cookie = "token=; path=/; max-age=0";
    notifyAuthChange();
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading: !hydrated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context =  useContext(AuthContext);

  if(!context) {
    throw new Error("useAuth must be used  inside AuthProvider.");
  }

  return context;
  }