'use strict'

let MainServiceGroup = require(_base + '/build/ServiceGroup/main-service-group');

class ChildServiceGroup extends MainServiceGroup {
	constructor(config) {
		super(config);
		console.log('ChSG:', config);
	}
}

module.exports = ChildServiceGroup;