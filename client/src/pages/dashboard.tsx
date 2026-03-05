import { Layout } from "@/components/layout";
import { useDevices, useDeleteDevice } from "@/hooks/use-devices";
import { AddDeviceDialog } from "@/components/add-device-dialog";
import { Monitor, Smartphone, Trash2, Loader2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { data: devices, isLoading } = useDevices();
  const { mutate: deleteDevice, isPending: isDeleting } = useDeleteDevice();
  const { toast } = useToast();

  const handleDelete = (id: number) => {
    deleteDevice(id, {
      onSuccess: () => {
        toast({ title: "Device removed" });
      },
      onError: (err) => {
        toast({ title: "Failed to remove device", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Devices</h1>
          <p className="text-muted-foreground mt-1">Manage your connected PCs and Mobile devices.</p>
        </div>
        <AddDeviceDialog />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !devices || devices.length === 0 ? (
        <div className="bg-card border border-dashed rounded-3xl p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
            <Monitor className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-bold font-display mb-2">No devices found</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            You haven't registered any devices yet. Add your Windows PC and Android phone to get started.
          </p>
          <AddDeviceDialog />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => {
            const isOnline = device.status === 'online';
            const Icon = device.os === 'windows' ? Monitor : Smartphone;
            
            return (
              <div 
                key={device.id} 
                className="bg-card rounded-2xl p-6 border shadow-sm card-hover relative overflow-hidden group"
              >
                {/* Decoration background glow */}
                <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full -mr-10 -mt-10 pointer-events-none transition-opacity ${isOnline ? 'bg-green-500/10' : 'bg-secondary'}`} />
                
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className={`p-3 rounded-xl ${device.os === 'windows' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${isOnline ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' : 'bg-secondary text-muted-foreground border-border'}`}>
                      {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {isOnline ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>
                
                <div className="relative z-10">
                  <h3 className="text-lg font-bold text-foreground mb-1">{device.name}</h3>
                  <div className="flex flex-col gap-1 mb-6">
                    <span className="text-sm font-mono text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded w-fit">
                      ID: {device.deviceId}
                    </span>
                    {device.lastSeen && (
                      <span className="text-xs text-muted-foreground mt-1">
                        Last seen: {formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex justify-end border-t pt-4">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-2 h-8">
                          <Trash2 className="w-4 h-4" /> Remove
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Device</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to remove <strong>{device.name}</strong>? This action cannot be undone and will break any existing pairings.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDelete(device.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                            disabled={isDeleting}
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
