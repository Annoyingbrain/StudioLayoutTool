// Web Bluetooth link to a Leica DISTO laser distance meter, for reading live
// measurements straight into the measurement panel instead of retyping them.
//
// Protocol (reverse-engineered by the community, not officially published by
// Leica): DISTOs with Bluetooth Smart (BLE) expose a service at
// 3ab10100-f831-4395-b29d-570977d5bf94. The D2 specifically has been
// documented (github.com/seichter/d2relay) exposing the live distance as a
// 4-byte little-endian IEEE754 float, in meters, on characteristic
// 3ab10101-f831-4395-b29d-570977d5bf94. Other DISTO models (X3 etc., per
// community BLE reverse-engineering on the B4X forums) expose the same kind
// of value on 3ab1010d-f831-4395-b29d-570977d5bf94 ("BASIC_MEASUREMENT")
// instead -- both are tried here since which one exists depends on the
// specific device/firmware, and this hasn't been verified against real D2
// hardware. Logs verbosely to the console (service/characteristic discovery,
// raw notification bytes) so a real connection attempt is debuggable without
// another round trip.
window.App = window.App || {};

App.disto = (function () {
  const SERVICE_UUID = '3ab10100-f831-4395-b29d-570977d5bf94';
  const MEASUREMENT_CHAR_UUIDS = [
    '3ab10101-f831-4395-b29d-570977d5bf94',
    '3ab1010d-f831-4395-b29d-570977d5bf94'
  ];

  let device = null;
  let readingCallback = null;
  let statusCallback = null;

  function log(...args) { console.log('[DISTO]', ...args); }

  function emitStatus() {
    if (statusCallback) {
      statusCallback({
        connected: !!(device && device.gatt && device.gatt.connected),
        deviceName: device ? device.name : null
      });
    }
  }

  function hex(view) {
    let s = '';
    for (let i = 0; i < view.byteLength; i++) s += view.getUint8(i).toString(16).padStart(2, '0') + ' ';
    return s.trim();
  }

  function handleNotify(event) {
    const view = event.target.value;
    if (!view) return;
    log(`notification on ${event.target.uuid}: [${hex(view)}] (${view.byteLength} bytes)`);
    if (view.byteLength < 4) return;
    // First 4 bytes, little-endian IEEE754 float, meters.
    const meters = view.getFloat32(0, true);
    log(`parsed as float32 (LE) = ${meters}`);
    if (Number.isFinite(meters) && meters > 0 && readingCallback) readingCallback(meters);
  }

  // Lists every service/characteristic the device actually exposes -- pure
  // diagnostics, printed to the console so a mismatch between what we
  // expect and what the real hardware has is immediately visible.
  async function logAllServices(server) {
    try {
      const services = await server.getPrimaryServices();
      for (const svc of services) {
        log('service:', svc.uuid);
        try {
          const chars = await svc.getCharacteristics();
          chars.forEach(c => log('  characteristic:', c.uuid, c.properties));
        } catch (e) { log('  (could not enumerate characteristics)', e.message); }
      }
    } catch (e) {
      log('could not enumerate services (device may restrict this to filtered/optional services):', e.message);
    }
  }

  // broad=true shows every nearby BLE device (for when the DISTO doesn't
  // advertise the service UUID directly, so the normal filtered scan
  // wouldn't list it) -- optionalServices still has to name the service so
  // Chrome allows accessing it after connecting.
  async function connect(opts) {
    const broad = opts && opts.broad;

    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth isn\'t available in this browser. Use Chrome or Edge, and make sure the page is served over HTTPS (or localhost).');
    }

    device = await navigator.bluetooth.requestDevice(broad
      ? { acceptAllDevices: true, optionalServices: [SERVICE_UUID] }
      : { filters: [{ services: [SERVICE_UUID] }] });
    log('device selected:', device.name, device.id);
    device.addEventListener('gattserverdisconnected', () => { log('gattserverdisconnected'); emitStatus(); });

    const server = await device.gatt.connect();
    log('GATT connected');
    await logAllServices(server);

    const service = await server.getPrimaryService(SERVICE_UUID);
    log('DISTO service found:', service.uuid);

    let characteristic = null;
    for (const uuid of MEASUREMENT_CHAR_UUIDS) {
      try {
        characteristic = await service.getCharacteristic(uuid);
        log('using measurement characteristic:', uuid);
        break;
      } catch (e) { log(`characteristic ${uuid} not present, trying next`); }
    }
    if (!characteristic) {
      throw new Error('Connected, but couldn\'t find a known measurement characteristic on this device -- check the console for the full service/characteristic list.');
    }

    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handleNotify);
    log('subscribed to notifications -- take a measurement on the DISTO now');

    emitStatus();
  }

  function disconnect() {
    if (device && device.gatt && device.gatt.connected) device.gatt.disconnect();
    emitStatus();
  }

  return {
    isSupported() { return !!navigator.bluetooth; },
    isConnected() { return !!(device && device.gatt && device.gatt.connected); },
    connect,
    disconnect,
    onReading(fn) { readingCallback = fn; },
    onStatusChange(fn) { statusCallback = fn; }
  };
})();
