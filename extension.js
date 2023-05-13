/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

const GETTEXT_DOMAIN = "android-usb-options-extension";

const { GObject, St, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ADB_DEVICES = ["adb", "devices"];
const SVC_SET_FUNCS = ["adb", "shell", "svc", "usb", "setFunctions"];

const USB_FUNCTIONS = [
  { label: "Transferring Files", func: "mtp" },
  { label: "USB tethering", func: "rndis" },
  { label: "MIDI", func: "midi" },
  { label: "Transferring images", func: "ptp" },
  { label: "Charge phone", func: "sec_charging" },
];

const _ = ExtensionUtils.gettext;

const _log = (msg) => {
  log("***********************************");
  log(msg);
  log("***********************************");
};

let volumeMonitor = Gio.VolumeMonitor.get();

function runCommand(command) {
  return new Promise((resolve, reject) => {
    let subprocess = new Gio.Subprocess({
      argv: command,
      flags: Gio.SubprocessFlags.STDOUT_PIPE,
    });

    subprocess.init(null);

    subprocess.communicate_utf8_async(null, null, (proc, res) => {
      try {
        let [, stdout] = proc.communicate_utf8_finish(res);
        resolve(stdout.trim());
      } catch (error) {
        reject(new Error(`Error executing adb command: ${error}`));
      }
    });
  });
}

const getDevices = async () =>
  new Promise((resolve) =>
    setTimeout(async () => {
      try {
        const stdout = await runCommand(["adb", "devices"]);

        const data = stdout.toString().split("\n");

        if (data.length <= 1) resolve(null);

        data.shift();

        const deviceList = data
          .map((device) => device.split("	"))
          .filter((device) => device[1] === "device")
          .map((device) => device[0]);

        resolve(deviceList);
      } catch (err) {
        _log(`92: ${err}`);
        reject(new Error("Get Devices failed"));
      }
    }, 2000)
  );

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init() {
      super._init(0.0, _("Android USB Options Indicator"));

      this.add_child(
        new St.Icon({
          icon_name: "smartphone",
          style_class: "system-status-icon",
        })
      );

      USB_FUNCTIONS.forEach((func) => {
        let item = new PopupMenu.PopupMenuItem(_(func.label));
        item.connect("activate", () => {
          runCommand([...SVC_SET_FUNCS, func.func]);
          // GLib.spawn_command_line_async(
          //   `adb shell svc usb setFunctions ${func.func}`
          // );
        });
        this.menu.addMenuItem(item);
      });
    }
  }
);

const onUSBChangeDetected = async (menu) => {
  try {
    const deviceList = await getDevices();

    // destroy indicator if no device is connected;
    if (menu?._indicator && (!deviceList || deviceList?.length <= 0)) {
      menu._indicator.destroy();
      menu._indicator = null;
      return;
    }

    // add indicator in panel if device is connected;
    if (deviceList?.length >= 1 && !menu._indicator) {
      menu._indicator = new Indicator();
      Main.panel.addToStatusArea(menu._uuid, menu._indicator);
    }
  } catch (err) {
    _log(`142: ${err}`);
  }
};

class Extension {
  constructor(uuid) {
    this._uuid = uuid;
    ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
  }

  enable() {
    volumeMonitor.connect("volume-added", () => {
      onUSBChangeDetected(this);
    });

    volumeMonitor.connect("volume-removed", () => {
      onUSBChangeDetected(this);
    });

    getDevices().then((devices) => {
      if (devices?.length <= 0) return;

      this._indicator = new Indicator();
      Main.panel.addToStatusArea(this._uuid, this._indicator);
    });
  }

  disable() {
    volumeMonitor.disconnect("volume-added", () => onUSBChangeDetected(this));
    volumeMonitor.disconnect("volume-removed", () => onUSBChangeDetected(this));

    if (!this._isindicator) return;

    this._indicator.destroy();
    this._indicator = null;
  }
}

function init(meta) {
  return new Extension(meta.uuid);
}
