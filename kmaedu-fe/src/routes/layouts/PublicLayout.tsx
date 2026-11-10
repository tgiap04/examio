import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import HeaderSection from "@/components/molecules/HeaderSection";
import FooterSection from "@/components/organisms/FooterSection";
import { GoogleOneTap } from "@/components/organisms/GoogleOneTap";

export function PublicLayout({ children }: PropsWithChildren) {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return (
    <div>
      <GoogleOneTap />
      <HeaderSection />
      {children}
      <FooterSection />
    </div>
  );
}
