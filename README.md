# homebridge-braava
homebridge-plugin for Braava Jet (tested only with Braava Jet m6).

[![npm version](https://badge.fury.io/js/homebridge-braava.svg)](https://badge.fury.io/js/homebridge-braava)
[![dependencies Status](https://david-dm.org/binomialstew/homebridge-braava/status.svg)](https://david-dm.org/binomialstew/homebridge-braava)

### Features:
- start on demand
- stop and dock on demand
- charging status
- battery level (with low battery warning)
- tank level indication (uses FilterMaintenance Service for now until a Tank Service is available)
- pad type and status indication
- ordered/unordered clean of specific rooms

### Fork:
This plugin was initially forked from:  
https://github.com/stvmallen/homebridge-roomba-stv

Thanks to [@esteban-mallen](https://github.com/stvmallen)

Modifications have been made to support iRobot Braava Jet m6. Additional support for Braava is planned for the future.

### Credits to:

https://github.com/koalazak/dorita980

https://github.com/umesan/homebridge-roomba

https://github.com/steedferns/homebridge-roomba980

https://github.com/gbro115/homebridge-roomba690

 [@matanelgabsi](https://github.com/matanelgabsi) for keepAlive feature

## Installation:
### 1. Install homebridge and Braava plugin.
- 1.a `sudo npm install -g homebridge --unsafe-perm`
- 1.b `sudo npm install -g homebridge-braava`

### 2. Find robotpwd and blid.
- 2.a Run `npm run getrobotpwd 192.168.xx.xx` where this plugin in installed
- 2.b Follow instructions

>Note that this command may fail if the iOS iRobot app is open or there are open connections to the 
Braava (including homebridge). It is recommended to stop any connections before attempting to run this command.

If successful, the following message will be displayed.

Please check **blid** and **Password** of displayed message.

```
Robot Data:
{ ver: '2',
  hostname: 'Braava-xxxxxxxxxxxxxxxx',
  robotname: 'Your Braava’s Name',
  ip: '192.168.xx.xx',
  mac: 'xx:xx:xx:xx:xx:xx',
  sw: 'vx.x.x-x',
  sku: 'R98----',
  nc: 0,
  proto: 'mqtt',
  blid: '0123456789abcdef' }
Password=> :1:2345678910:ABCDEFGHIJKLMNOP <= Yes, all this string.
```

### 4. Update homebridge configuration file.
```
"accessories": [
  {
    "accessory": "Braava",
    "name": "Your chosen name",
    "model": "m6",
    "blid": "1234567890",
    "robotpwd": "aPassword",
    "ipaddress": "192.168.xx.xx",
    "autoRefreshEnabled": true,
    "keepAliveEnabled": true, // If you use local network mode in iRobot app, consider disabling. see note below
    "cacheTTL": 30 //in seconds
  }
]
```

#### Refresh mode
This plugins supports these refresh modes:
- NONE (`autoRefreshEnabled` and `keepAlive` both set to false) - no auto refresh, we will connect to braava and poll status when requested by home app. Please note that this will cause "Updating" status for all homebridge accessories.

- AUTO REFRESH (`autoRefreshEnabled` set to true) - we will connect to braava, every `pollingInterval` seconds, and store the status in cache. if `pollingInterval` = `cacheTTL` - 10 (or more), this will make sure we will always have a valid status.

- KEEP ALIVE (`keepAlive` set to true) - we will keep a connection to braava, this will cause app to fail to connect to braava in local network mode (cloud mode will work just fine, even in your home wifi). This will lead to better performance (status will refresh faster, and toggle will work faster as well). **Keep in mind this will increase the Braava battery consumption**.

### Advanced configuration
#### Ordered room cleaning
For robots with the ability to set ordered cleaning of rooms, an object can be supplied in the configuration specifying which rooms to clean and in what order.
Note that a smart map is required to use this feature. If you have the ability to set a room-specific cleaning in your iRobot app, you should be able to set the plugin configuration to do the same. 

To get the regions defined in your smart map, inspect the robot state for the `lastCommand` value. There are a few different ways to do this. Probably the simplest—while using this plugin, you can set homebridge to debug mode, which will output `state.lastCommand` on a state update:

> Homebridge Settings >
> Startup Options >
> Homebridge Debug Mode

Alternatively, you can use [koalazak/rest980](https://github.com/koalazak/rest980) to inspect the state.

Use `ordered`, `regions`, `pmap_id` and `user_pmapv_id` in your `orderedClean` config:

```
"accessories": [
    {
        "name": "Your chosen name",
        "model": "m6",
        "blid": "1234567890",
        "robotpwd": "aPassword",
        "ipaddress": "192.168.xx.xx",
        "autoRefreshEnabled": true,
        "keepAliveEnabled": true,
        "accessory": "Braava",
        "orderedClean": {
            "ordered": 1, // 0 to run unordered
            "regions": [
                {
                    "region_id": "3"
                },
                {
                    "region_id": "1"
                },
                {
                    "region_id": "2"
                }
            ],
            "pmap_id": "xxxxxxxxxxxxxxxxxxxx",
            "user_pmapv_id": "XXXXXXXXXXXX"
        }
    }
]
```