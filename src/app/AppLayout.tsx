export const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {children}
    </div>
  );
};