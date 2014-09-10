function loadScript(src,callback){  
	var script = document.createElement("script");
	script.type = "text/javascript";
	if(callback)script.onload=callback;
	document.getElementsByTagName("head")[0].appendChild(script);
	script.src = src;
}

function parseDate(timestamp) { 
	var dt       = new Date(parseInt(timestamp)*1000);
	var s_time   = dt.getHours() + ":" + strpad(dt.getMinutes(),2) + ":" + strpad(dt.getSeconds(),2);
	var s_date   = dt.getFullYear() + "-" + strpad((dt.getMonth()+1),2) + "-" + strpad(dt.getDate(),2);
	var d        = new Date();
	var cur_date = d.getFullYear() + '-' + strpad((d.getMonth()+1),2) + '-' + strpad(d.getDate(),2);

	if(s_date == cur_date) {
		return s_time;
	} else {
		return s_date + " at " + s_time;
	}
}

function strpad(str, max) {
	str = str.toString();
	return str.length < max ? strpad("0" + str, max) : str;
}

function getShortLocation(location){
	var shortArray = location.split(",");
	return shortArray[0];
}