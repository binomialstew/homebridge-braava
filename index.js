let Service;
let Characteristic;

const dorita980 = require("dorita980");
const nodeCache = require("node-cache");
const timeout = require('promise-timeout').timeout;
const STATUS = "status";
const OLD_STATUS = 'oldStatus';

const braavaAccessory = function (log, config) {
    this.log = log;
    this.name = config.name;
    this.model = config.model;
    this.blid = config.blid;
    this.robotpwd = config.robotpwd;
    this.ipaddress = config.ipaddress;
    this.firmware = "N/A";
    this.keepAliveEnabled = config.keepAliveEnabled;
    this.autoRefreshEnabled = config.autoRefreshEnabled;
    this.cacheTTL = config.cacheTTL || 5;
    this.disableWait = config.disableWait;
    this.braava = null;

    this.accessoryInfo = new Service.AccessoryInformation();
    this.switchService = new Service.Switch(this.name);
    this.batteryService = new Service.BatteryService(`${this.name} Battery`);
    this.padService = new Service.ContactSensor(`${this.name} Pad`);
    this.tankService = new Service.FilterMaintenance(`${this.name} Tank`);

    this.cache = new nodeCache({
        stdTTL: this.cacheTTL,
        checkperiod: 1,
        useClones: false
    });

    if (this.keepAliveEnabled) {
        this.registerStateUpdate();
    } else if (this.autoRefreshEnabled) {
        this.enableAutoRefresh();
    }
};

braavaAccessory.prototype = {
    getBraava() {
        if (this.keepAliveEnabled) {
            if (this.braava == null) {
                this.braava = new dorita980.Local(this.blid, this.robotpwd, this.ipaddress);
            }
            return this.braava;
        } else {
            return new dorita980.Local(this.blid, this.robotpwd, this.ipaddress);
        }
    },

    onConnected(braava, callback, silent) {
        if (this.keepAliveEnabled && braava.connected) {
            callback();
        } else {
            braava.on("connect", () => {
                if (!silent) {
                    this.log("Connected to Braava");
                } else {
                    this.log.debug("Connected to Braava");
                }
                callback();
            });
        }
    },

    setState(powerOn, callback) {
        let braava = this.getBraava();

        this.cache.del(STATUS);

        if (powerOn) {
            this.log("Starting Braava");

            this.onConnected(braava, async () => {
                try {
                    this.log("Braava is running");

                    await braava.clean();

                    callback();
                } catch (error) {
                    this.log("Braava failed: %s", error.message);

                    callback(error);
                } finally {
                    await setTimeout(() => this.log.debug('Trying to dock again...'), 2000);

                    this.endBraavaIfNeeded(braava);
                }
            });
        } else {
            this.log("Braava pause and dock");

            this.onConnected(braava, async () => {
                try {
                    this.log("Braava is pausing");

                    await braava.pause();

                    callback();

                    this.log("Braava paused, returning to Dock");

                    this.dockWhenStopped(braava, 3000);
                } catch (error) {
                    this.log("Braava failed: %s", error.message);

                    this.endBraavaIfNeeded(braava);

                    callback(error);
                }
            });
        }
    },

    endBraavaIfNeeded(braava) {
        if (!this.keepAliveEnabled) {
            braava.end();
        }
    },

    async dockWhenStopped(braava, pollingInterval) {
        try {
            const state = await braava.getRobotState(["cleanMissionStatus"]);

            switch (state.cleanMissionStatus.phase) {
                case "stop":
                    this.log("Braava has stopped, issuing dock request");

                    await braava.dock();
                    this.endBraavaIfNeeded(braava);

                    this.log("Braava docking");

                    break;
                case "run":
                    this.log("Braava is still running. Will check again in 3 seconds");

                    await setTimeout(() => this.log.debug('Trying to dock again...'), pollingInterval);
                    this.dockWhenStopped(braava, pollingInterval);

                    break;
                default:
                    this.endBraavaIfNeeded(braava);

                    this.log("Braava is not running");

                    break;
            }
        } catch (error) {
            this.log(error);
            this.endBraavaIfNeeded(braava);
        }
    },

    getRunningStatus(callback) {
        this.log("Running status requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status.running);
            }
        });
    },

    getIsCharging(callback) {
        this.log("Charging status requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status.charging);
            }
        });
    },

    getBatteryLevel(callback) {
        this.log("Battery level requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status.batteryLevel);
            }
        });
    },

    getLowBatteryStatus(callback) {
        this.log("Battery status requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status.batteryStatus);
            }
        });
    },

    getPadState(callback) {
        this.log("Pad state requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status.padDetected);
            }
        });
    },
    getTankState(callback) {
        this.log("Tank state requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status.tankReady);
            }
        });
    },
    getTankLevel(callback) {
        this.log("Tank fill level requested");

        this.getStatus((error, status) => {
            if (error) {
                callback(error);
            } else {
                callback(null, status.tankLevel);
            }
        });
    },

    identify(callback) {
        this.log("Identify requested. Not supported yet.");

        callback();
    },

    getStatus(callback, silent) {
        let status = this.cache.get(STATUS);

        if (status) {
            callback(status.error, status);
        } else if (!this.autoRefreshEnabled) {
            this.getStatusFromBraava(callback, silent);
        } else {
            if (!this.disableWait) {
                setTimeout(() => this.getStatus(callback, silent), 10);
            } else if (this.cache.get(OLD_STATUS)) {
                this.log.warn('Using expired status');

                status = this.cache.get(OLD_STATUS);
                callback(status.error, status);
            } else {
                callback('Failed getting status');
            }
        }
    },

    getStatusFromBraava(callback, silent) {
        let braava = this.getBraava();

        this.onConnected(braava, async () => {
            try {
                const response = await timeout(
                    braava.getRobotState(["cleanMissionStatus", "batPct", "mopReady", "detectedPad", "tankLvl"]),
                    5000
                );
                const status = this.parseState(response);

                if (this.autoRefreshEnabled) {
                    this.cache.set(STATUS, status);
                }

                callback(null, status);

                if (!silent) {
                    this.log("Braava[%s]", JSON.stringify(status));
                } else {
                    this.log.debug("Braava[%s]", JSON.stringify(status));
                }
            } catch (error) {
                if (!silent) {
                    this.log("Unable to determine state of Braava");
                } else {
                    this.log.debug("Unable to determine state of Braava");
                }

                this.log.debug(error);

                callback(error);

                this.cache.set(STATUS, {error: error});
            } finally {
                this.endBraavaIfNeeded(braava);
            }
        }, silent);
    },

    parsePadType(padType) {
        const padTypes = {
            dispDry: "Disposable Dry",
            dispWet: "Disposable Wet",
            invalid: "Invalid",
            reusableDry: "Reusable Dry",
            reusableWet: "Reusabled Wet"
        }
        return !(padType in padTypes) ? "Unknown" : padTypes[padType]
    },

    parseState(state) {
        let status = {
            running: 0,
            charging: 0,
            batteryLevel: "N/A",
            batteryStatus: "N/A",
            padDetected: "N/A",
            padType: "N/A",
            tankReady: "N/A",
            tankLevel: "N/A"
        };

        status.batteryLevel = state.batPct;
        status.padType = state.detectedPad;
        status.padDetected = state.detectedPad !== "None" && state.detectedPad !== "invalid"
            ? Characteristic.ContactSensorState.CONTACT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
        status.tankReady = state.mopReady.tankPresent && state.mopReady.lidClosed
            ? Characteristic.FilterChangeIndication.FILTER_OK
            : Characteristic.FilterChangeIndication.CHANGE_FILTER;
        status.tankLevel = state.tankLvl;

        if (status.batteryLevel <= 20) {
            status.batteryStatus = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
        } else {
            status.batteryStatus = Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
        }

        switch (state.cleanMissionStatus.phase) {
            case "run":
                status.running = 1;
                status.charging = Characteristic.ChargingState.NOT_CHARGING;

                break;
            case "charge":
                status.running = 0;
                status.charging = Characteristic.ChargingState.CHARGING;

                break;
            default:
                status.running = 0;
                status.charging = Characteristic.ChargingState.NOT_CHARGING;

                break;
        }
        return status;
    },

    getServices() {
        this.accessoryInfo.setCharacteristic(Characteristic.Manufacturer, "iRobot");
        this.accessoryInfo.setCharacteristic(Characteristic.SerialNumber, "See iRobot App");
        this.accessoryInfo.setCharacteristic(Characteristic.Identify, false);
        this.accessoryInfo.setCharacteristic(Characteristic.Name, this.name);
        this.accessoryInfo.setCharacteristic(Characteristic.Model, this.model);
        this.accessoryInfo.setCharacteristic(Characteristic.FirmwareRevision, this.firmware);

        this.switchService
            .getCharacteristic(Characteristic.On)
            .on("set", this.setState.bind(this))
            .on("get", this.getRunningStatus.bind(this));

        this.batteryService
            .getCharacteristic(Characteristic.BatteryLevel)
            .on("get", this.getBatteryLevel.bind(this));
        this.batteryService
            .getCharacteristic(Characteristic.ChargingState)
            .on("get", this.getIsCharging.bind(this));
        this.batteryService
            .getCharacteristic(Characteristic.StatusLowBattery)
            .on("get", this.getLowBatteryStatus.bind(this));
        this.tankService
            .getCharacteristic(Characteristic.FilterLifeLevel)
            .on("get", this.getTankLevel.bind(this));
        this.tankService
            .getCharacteristic(Characteristic.FilterChangeIndication)
            .on("get", this.getTankState.bind(this));
        this.padService
            .getCharacteristic(Characteristic.ContactSensorState)
            .on("get", this.getPadState.bind(this));

        return [this.accessoryInfo, this.switchService, this.batteryService, this.tankService, this.padService];
    },

    registerStateUpdate() {
        this.log("Enabling keepAlive");

        const braava = this.getBraava();

        braava.on("state", state => {
            const status = this.parseState(state);

            this.padService.setCharacteristic(
                Characteristic.Name,
                `${this.name} ${this.parsePadType(status.padType)} Pad`
            )

            if (this.autoRefreshEnabled) {
                this.cache.set(STATUS, status);
            }

            this.updateCharacteristics(status);
        });
    },

    updateCharacteristics(status) {
        this.switchService
            .getCharacteristic(Characteristic.On)
            .updateValue(status.running);
        this.batteryService
            .getCharacteristic(Characteristic.ChargingState)
            .updateValue(status.charging);
        this.batteryService
            .getCharacteristic(Characteristic.BatteryLevel)
            .updateValue(status.batteryLevel);
        this.batteryService
            .getCharacteristic(Characteristic.StatusLowBattery)
            .updateValue(status.batteryStatus);
        this.tankService
            .getCharacteristic(Characteristic.FilterChangeIndication)
            .updateValue(status.tankReady);
        this.tankService
            .getCharacteristic(Characteristic.FilterLevel)
            .updateValue(status.tankLevel);
        this.padService
            .getCharacteristic(Characteristic.ContactSensorState)
            .updateValue(status.padDetected);
    },

    enableAutoRefresh() {
        this.log("Enabling autoRefresh every %s seconds", this.cache.options.stdTTL);

        let that = this;
        this.cache.on('expired', (key, value) => {
            that.log.debug(key + " expired");

            that.cache.set(OLD_STATUS, value, 0);

            that.getStatusFromBraava((error, status) => {
                if (!error) that.updateCharacteristics(status);
            }, true);
        });

        this.getStatusFromBraava((error, status) => {
            if (!error) that.updateCharacteristics(status);
        }, true);
    }
};

module.exports = homebridge => {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-braava", "Braava", braavaAccessory);
};
