/**
 * Mounts Web Push device registration for the signed-in user.
 *
 * Renders nothing. `useRegisterPushDevice` only auto-registers when the
 * browser has *already* granted notification permission, so mounting this in
 * an authenticated shell never triggers an unsolicited permission prompt — it
 * simply keeps the device's push subscription registered and `last_seen_at`
 * fresh on every visit.
 *
 * Without this, no row is ever written to the push-device table and the
 * automation engine has nobody to deliver to. Granting permission in the
 * first place is done explicitly from <EnablePushCard />.
 */

import { useRegisterPushDevice } from "@/hooks/useRegisterPushDevice";

export function PushDeviceRegistrar() {
  useRegisterPushDevice();
  return null;
}
