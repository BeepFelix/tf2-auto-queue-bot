# TF2 Auto Queue Bot

Automatically queue for a Casual match in Team Fortress 2. Will NOT actually join the match or do anything, just gives you some data once a match has been found and allows you to control what datacenters you want to connect to.

This includes a webinterface, its not good but it does its job, the main bot is inside the [src](src) folder.

# Config
- `port`: Number
	- Which port to use for the webserver - Go to "localhost:`<port>`" to access the webinterfaaace
- `steamWebAPIKey`: String
	- Your Steam Web API Key from [here](https://steamcommunity.com/dev/apikey).
- `accountName`: String
	- Steam account login name of a bot you want to use for the queuing
- `password`: String
	- Steam account password

# Installation
1. Install [NodeJS](https://nodejs.org/)
2. Rename `config.json.example` to `config.json`
3. Adjust the config to how you want it
4. Open a command prompt within the folder
5. Run `npm install` to install the dependencies
6. Run `node index.js` to run the webserver
7. Go to `http://localhost:8181` (Replace `8181` with the port from your `config.json`)
8. Select a datagram config
9. Run the bot

It will automatically exit the process once a match is found.
