/** Short sourced histories for the hand-modelled landmarks. Every fact names the sources that support it. */
export interface StorySource{id:string;title:string;publisher:string;url:string}
export interface StoryFact{text:string;sources:string[]}
export interface LandmarkStory{facts:StoryFact[];sources:StorySource[]}
/** When the cited pages were last read against these facts. */
export const STORIES_CHECKED='2026-09-28';

export const LANDMARK_STORIES:Record<string,LandmarkStory>={
 station:{
  facts:[
   {text:'Reading station opened on 30 March 1840, when the first public train left for Paddington.',sources:['museum']},
   {text:'The listed main building dates from 1865 to 1867, an enlargement and remodelling of Brunel’s original station of about 1840.',sources:['listing']},
   {text:'The rebuilt station, with two new entrances, five new platforms and a wider footbridge, was finished by Network Rail a year ahead of schedule.',sources:['dft']},
   {text:'The Queen officially opened it on 17 July 2014.',sources:['dft','museum']}
  ],
  sources:[
   {id:'museum',title:'Reading Station 180 Years',publisher:'Reading Museum',url:'https://www.readingmuseum.org.uk/blog/reading-station-180-years'},
   {id:'listing',title:'Main Building of Reading General Station (list entry 1321892)',publisher:'Historic England',url:'https://historicengland.org.uk/listing/the-list/list-entry/1321892'},
   {id:'dft',title:'Transport Secretary welcomes Reading Station redevelopment',publisher:'GOV.UK',url:'https://www.gov.uk/government/news/transport-secretary-welcomes-reading-station-redevelopment'}
  ]
 },
 'town-hall':{
  facts:[
   {text:'The oldest part is the Victoria Hall of 1785–86, designed by Charles Poulton.',sources:['listing']},
   {text:'In 1875 Alfred Waterhouse added the clock tower, council chamber, Mayor’s rooms and offices, wrapping his building around the older hall.',sources:['museum']},
   {text:'Waterhouse did not design the later extension. After a competition, the Hove architect Thomas Lainson’s design was built between 1879 and 1882.',sources:['listing']},
   {text:'The whole complex is listed at Grade II*.',sources:['listing']}
  ],
  sources:[
   {id:'museum',title:'Our building history',publisher:'Reading Museum',url:'https://www.readingmuseum.org.uk/your-visit/our-building-history'},
   {id:'listing',title:'Reading Town Hall (list entry 1113400)',publisher:'Historic England',url:'https://historicengland.org.uk/listing/the-list/list-entry/1113400'}
  ]
 },
 abbey:{
  facts:[
   {text:'Henry I founded the abbey in 1121. He died before it was finished and was buried in front of the high altar in 1136.',sources:['quarter']},
   {text:'‘Sumer is icumen in’, the oldest known English round, was first written down in a 13th-century manuscript kept at the abbey.',sources:['royal']},
   {text:'Henry VIII closed the abbey in 1539. Its last abbot, Hugh Cook of Faringdon, was executed for treason that November.',sources:['quarter','abbot']},
   {text:'The £3.15 million Reading Abbey Revealed project restored the Abbey Gateway, and the ruins reopened on 16 June 2018 after nine years of closure.',sources:['revealed','gateway','reopened']}
  ],
  sources:[
   {id:'quarter',title:'History of the Abbey Quarter',publisher:'Reading Museum',url:'https://www.readingmuseum.org.uk/your-visit/abbey-quarter/history-abbey-quarter'},
   {id:'royal',title:'A short history of Reading: Reading’s royal abbey',publisher:'Reading Museum',url:'https://www.readingmuseum.org.uk/blog/short-history-reading-readings-royal-abbey'},
   {id:'abbot',title:'The last Abbot of Reading',publisher:'Reading Museum',url:'https://www.readingmuseum.org.uk/blog/last-abbot-reading'},
   {id:'revealed',title:'Reading Abbey Revealed project',publisher:'Reading Museum',url:'https://www.readingmuseum.org.uk/your-visit/abbey-quarter/reading-abbey-revealed-project'},
   {id:'gateway',title:'Newly restored Abbey Gateway revealed',publisher:'Reading Borough Council',url:'https://media.reading.gov.uk/news/newly-restored-abbey-gateway-revealed'},
   {id:'reopened',title:'Reading Abbey Re-Opened to the Public',publisher:'Historic England',url:'https://historicengland.org.uk/whats-new/in-your-area/south-east/reading-abbey-re-opened/'}
  ]
 },
 oracle:{
  facts:[
   {text:'The Oracle was a workhouse built in Minster Street in 1628. The Reading businessman John Kendrick left money in his will to set it up and create weaving jobs in the town.',sources:['gates','minster']},
   {text:'It was demolished in 1850. Only the upper part of its oak gates survives, restored for display at Reading Museum.',sources:['gates']},
   {text:'The original Oracle site later became a small part of the shopping centre, which opened on 23 September 1999 on the former site of Simonds Brewery and Reading’s bus depot.',sources:['gates','opening']}
  ],
  sources:[
   {id:'gates',title:'The Oracle Gates: conservation, community, culture',publisher:'Reading Museum',url:'https://www.readingmuseum.org.uk/blog/oracle-gates-conservation-community-culture'},
   {id:'minster',title:'Reading Minster',publisher:'Reading Museum',url:'https://www.readingmuseum.org.uk/reading-minster'},
   {id:'opening',title:'Looking back at The Oracle opening as it celebrates 20 years in Reading',publisher:'Berkshire Live',url:'https://www.getreading.co.uk/news/berkshire-history/looking-back-oracle-opening-celebrates-16951660'}
  ]
 },
 university:{
  facts:[
   {text:'In 1892 an Oxford University extension unit merged with the Schools of Science and Art to form Reading College, with the geographer Halford Mackinder as its first Principal.',sources:['history']},
   {text:'It received its Royal Charter on 17 March 1926 and became the University of Reading.',sources:['centenary','charter']},
   {text:'In 1947 it bought Whiteknights Park, the former estate of the Marquis of Blandford, which became the new heart of the university.',sources:['history','centenary']}
  ],
  sources:[
   {id:'history',title:'A photographic history of the University of Reading',publisher:'University of Reading',url:'https://www.reading.ac.uk/about/history'},
   {id:'centenary',title:'Centenary timeline',publisher:'University of Reading',url:'https://www.reading.ac.uk/centenary/centenary-timeline'},
   {id:'charter',title:'Cheers to 100 years!',publisher:'University of Reading',url:'https://sites.reading.ac.uk/connected/2026/03/17/cheers-to-100-years/'}
  ]
 },
 stadium:{
  facts:[
   {text:'Reading FC played at Elm Park from 1896. The last competitive match there was against Norwich City on 3 May 1998.',sources:['elm']},
   {text:'Sir John Madejski bought the new site, a former rubbish tip, from Reading Borough Council for £1, on condition that the club paid for an access road from the A33.',sources:['before']},
   {text:'The Madejski Stadium opened in 1998 with a 3–0 win over Luton Town.',sources:['building']}
  ],
  sources:[
   {id:'elm',title:'Elm Park',publisher:'Reading FC',url:'https://www.readingfc.co.uk/history/elm-park/'},
   {id:'before',title:'A look back at life before the Madejski Stadium was built in Reading',publisher:'Berkshire Live',url:'https://www.getreading.co.uk/news/reading-berkshire-news/gallery/look-back-life-before-madejski-22568576'},
   {id:'building',title:'Pick of the Past: The building of the Madejski Stadium',publisher:'Berkshire Live',url:'https://www.getreading.co.uk/news/berkshire-history/pick-past-building-madejski-stadium-8350702'}
  ]
 }
};
