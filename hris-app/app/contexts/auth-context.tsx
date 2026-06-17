import { createContext } from "react";
import type { AuthContextType } from "~/types/auth";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export default AuthContext;
