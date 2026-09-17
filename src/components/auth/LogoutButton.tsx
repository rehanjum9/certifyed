"use client";

import { useLogout } from "@/lib/auth/useLogout";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { IconLogOut } from "@/components/ui/icons";

interface LogoutButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** The one Logout control outside the header account menu -- shares the same sign-out action via useLogout. */
export function LogoutButton({ variant = "danger", size = "sm" }: LogoutButtonProps) {
  const { logout, loggingOut } = useLogout();

  return (
    <Button variant={variant} size={size} onClick={logout} disabled={loggingOut}>
      {loggingOut ? <Spinner className="h-4 w-4" /> : <IconLogOut className="h-4 w-4" />}
      Logout
    </Button>
  );
}
