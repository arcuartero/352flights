import "../ops.css";
import { OpsScannerStatusHub } from "@/components/ops-scanner-status-hub";

export default function OpsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <div className="ops-scanner-status-stack">
        <OpsScannerStatusHub />
      </div>
    </>
  );
}
