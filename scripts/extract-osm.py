"""pip install osmium; python scripts/extract-osm.py raw/berkshire.osm.pbf
Read Geofabrik OSM, assemble multipolygons, retain the bounded Reading region.
"""
import osmium, json, sys, datetime, os
B=(-1.08,51.39,-0.84,51.50)
factory=osmium.geom.GeoJSONFactory()
features=[]
def near(coords):
 if len(coords)==0:return False
 if isinstance(coords[0],(float,int)):return B[0]<=coords[0]<=B[2] and B[1]<=coords[1]<=B[3]
 return any(near(x) for x in coords)
def add(obj,geom,kind):
 if near(geom['coordinates']):
  tags=dict(obj.tags);tags['osm_id']=f'{kind}/{obj.orig_id() if kind=="area" else obj.id}'
  features.append({'type':'Feature','id':len(features),'properties':tags,'geometry':geom})
class Extract(osmium.SimpleHandler):
 def node(self,n):
  if any(k in n.tags for k in ['place','traffic_sign','maxspeed','enforcement']) or n.tags.get('highway')=='speed_camera' or n.tags.get('railway')=='station':
   if n.location.valid():add(n,{'type':'Point','coordinates':[n.location.lon,n.location.lat]},'node')
 def way(self,w):
  if any(k in w.tags for k in ['highway','railway','waterway']):
   try:add(w,json.loads(factory.create_linestring(w)),'way')
   except (RuntimeError,osmium.InvalidLocationError):pass
 def area(self,a):
  if any(k in a.tags for k in ['building','landuse','leisure']) or a.tags.get('natural') in ['water','wood','scrub','wetland']:
   try:add(a,json.loads(factory.create_multipolygon(a)),'area')
   except (RuntimeError,osmium.InvalidLocationError):pass
Extract().apply_file(sys.argv[1],locations=True,idx='flex_mem')
os.makedirs('raw',exist_ok=True)
with open('raw/geography.geojson','w')as f:json.dump({'type':'FeatureCollection','features':features},f,separators=(',',':'))
with open('raw/osm-source.json','w')as f:json.dump({'url':'https://download.geofabrik.de/europe/united-kingdom/england/berkshire.html','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'timestamp':osmium.io.Reader(sys.argv[1]).header().get('osmosis_replication_timestamp')},f)
print(f'Extracted {len(features)} Reading features')
