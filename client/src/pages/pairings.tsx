import { Layout } from "@/components/layout";
import { usePairings } from "@/hooks/use-pairings";
import { AddPairingDialog } from "@/components/add-pairing-dialog";
import { Link2, Loader2, Link as LinkIcon, Monitor, Smartphone, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useDevices } from "@/hooks/use-devices";

export default function Pairings() {
  const { data: pairings, isLoading: isPairingsLoading } = usePairings();
  const { data: devices, isLoading: isDevicesLoading } = useDevices();

  const isLoading = isPairingsLoading || isDevicesLoading;

  const getDeviceName = (deviceId: string) => {
    return devices?.find(d => d.deviceId === deviceId)?.name || deviceId;
  };

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Pairings</h1>
          <p className="text-muted-foreground mt-1">Manage active connections between your devices.</p>
        </div>
        <AddPairingDialog />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !pairings || pairings.length === 0 ? (
        <div className="bg-card border border-dashed rounded-3xl p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
            <Link2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-bold font-display mb-2">No active pairings</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Link a Windows PC with an Android device to start controlling it remotely.
          </p>
          <AddPairingDialog />
        </div>
      ) : (
        <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">PC Device</th>
                  <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Mobile Device</th>
                  <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Status</th>
                  <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pairings.map((pairing) => (
                  <tr key={pairing.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 flex items-center justify-center shrink-0">
                          <Monitor className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{getDeviceName(pairing.pcDeviceId)}</p>
                          <p className="text-xs font-mono text-muted-foreground">{pairing.pcDeviceId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{getDeviceName(pairing.mobileDeviceId)}</p>
                          <p className="text-xs font-mono text-muted-foreground">{pairing.mobileDeviceId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                        </span>
                        <span className="text-sm font-medium capitalize">{pairing.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">
                        {pairing.createdAt ? formatDistanceToNow(new Date(pairing.createdAt), { addSuffix: true }) : 'Unknown'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
