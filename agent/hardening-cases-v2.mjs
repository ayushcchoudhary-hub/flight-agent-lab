import {CITY_CODES} from './eval-cases.mjs';

export const HARDENING_V2_CLOCK='2026-09-18';

const rolling=(origin,destination,cabin='business')=>({status:'results',origin,destination,cabin,from:'2026-09-18',to:'2026-09-25',posts:1});
const exact=(origin,destination,date='2026-10-01',cabin='business')=>({status:'results',origin,destination,cabin,from:date,to:date,posts:1});
const clarify=(extra={})=>({status:'clarify',posts:0,...extra});
const one=(id,category,name,text,expected,requirement)=>({id,category,name,requirement,steps:[{text,expected}]});

// Corrected expectations, recorded rather than silently adjusted:
//
// C2 and C5 previously expected a new POST for every turn. The search cache
// key is origin, destination, dates and cabin, so sort, nonstop and a restated
// cabin reuse the existing results by design and the reply says so. The agent
// was right and the counts were wrong.
//
// C2 also expected a citation for "what is your refund policy?". The snapshot
// holds ten privacy chunks and two terms placeholders and no refund content at
// all, so no citation can exist. It now accepts the support handoff, which is
// the honest answer. Adding refund text to the snapshot would mean inventing
// policy.
//
// D2 changed by product decision on 2026-09-23: stating a home airport saves
// it, with no separate Save step. D4 (a cabin default) is still a proposal.
//
// G7 changed by product decision on 2026-09-23: the feed decides, so a stale
// feed's past-dated deals are shown with their check date, not hidden.
//
// D1 changed by product decision on 2026-09-23. It asserted that a new
// conversation must not reuse London from a closed search. The product now
// remembers the last origin used, discloses it, and still forgets cabin,
// dates and budget. The eval harness applies that memory between sessions.
//
// C1 changed by product decision on 2026-09-21. "Make it the 3rd", straight
// after three lettered options, could mean 3 October or the third option. The
// rule agreed for ambiguity is to ask rather than search on a guess, so the
// case now expects a question with the trip untouched, then the date once the
// traveler answers. It still allows at most five searches. Its last step
// reuses results: a budget is a filter on the results already held, outside
// the cache key, like sort and nonstop in C2 and C5.
//
// A5's requirement said "Sidney in Canada". The only Sidney airport in the
// data is in Montana, so the judge marked a correct menu wrong. Corrected
// 2026-09-21.
//
// C1's "drop the budget" and C2's "ok cheapest first" accepted a reply that
// only said the results were the same ones. Both now require the reply to name
// what the instruction changed. The expectations were incomplete, not wrong.
//
// F1's "book it" step accepted any mention of checkout. The reply it accepted
// ignored the link shown one message earlier, so the step now requires that
// same link. The expectation was too weak rather than wrong.
export const HARDENING_CASES_V2=[
 one('A1','Places','Country destination becomes an airport menu','London to Japan next week',clarify({origin:CITY_CODES.London,destination:null,pending:'destination',from:'2026-09-21',to:'2026-09-27',mentions:'(?=.*Tokyo)(?=.*Osaka)'}),'Offer a numbered menu of Japan’s main airports, keep London and next week, and ask one concise question.'),
 one('A2','Places','Country origin becomes an airport menu','from the UK to Singapore on 3 Oct',clarify({origin:null,destination:CITY_CODES.Singapore,pending:'origin',from:'2026-10-03',to:'2026-10-03',mentions:'UK|United Kingdom|London|Heathrow'}),'Offer a numbered menu of the UK’s main airports, keep Singapore and the exact date, and ask one concise question.'),
 one('A3','Places','Two unambiguous misspellings resolve visibly','Singapor to Londn 1 oct',exact(CITY_CODES.Singapore,CITY_CODES.London),'Resolve the two clear misspellings and show Singapore and London in the reply.'),
 one('A4','Places','Airport misspelling resolves visibly','Heathrw to JFK tomorrow',exact('LHR','JFK','2026-09-19'),'Resolve Heathrow to LHR, keep JFK and tomorrow, and show the resolved airport names.'),
 one('A5','Places','Two close place matches are clarified','fly me to Sidney',clarify({destination:null,pending:'destination',mentions:'(?=.*Sydney)(?=.*Sidney)'}),'Ask whether the traveler means Sydney in Australia or Sidney in the United States. Do not guess either.'),
 one('A6','Places','Ambiguous numeric date is clarified with trip retained','lhr-jfk 2/10 biz',clarify({origin:'LHR',destination:'JFK',cabin:'business',mentions:'2 October|10 February|date'}),'Ask one short date question and retain LHR, JFK and business class.'),
 {id:'A7',category:'Places',name:'Unsupported city is never silently replaced',requirement:'Search Paris to New York when supported. Otherwise state the Paris limitation plainly. Never substitute another origin.',steps:[{text:'Paris to New York on 1 October',expected:{outcomes:[{status:'results',origin:'CDG|ORY',destination:CITY_CODES['New York'],from:'2026-10-01',to:'2026-10-01',posts:1},{status:'clarify',posts:0,mentions:'Paris.*not supported|not supported.*Paris'}]}}]},
 one('A8','Places','Same origin and destination are clarified','Dubai to Dubai tomorrow',clarify({origin:CITY_CODES.Dubai,destination:CITY_CODES.Dubai,mentions:'same|different'}),'Point out that origin and destination are the same and ask for the intended route.'),

 one('B1','Missing information','No date uses the stated rolling window','London to New York',rolling(CITY_CODES.London,CITY_CODES['New York']),'Search the documented seven-day window, state the dates, use business class and invite a date change.'),
 one('B2','Missing information','Destination and cabin ask only for origin','I want to go to Dubai in business',clarify({destination:CITY_CODES.Dubai,cabin:'business',pending:'origin'}),'Keep Dubai and business class. Ask only where the traveler is flying from, without asking for a date.'),
 one('B3','Missing information','Origin and date ask only for destination','Leaving from Singapore on 5 Oct',clarify({origin:CITY_CODES.Singapore,from:'2026-10-05',to:'2026-10-05',pending:'destination'}),'Keep Singapore and the exact date. Ask only for the destination.'),
 one('B4','Missing information','Very incomplete request asks one useful question','flights pls',clarify(),'Ask one concise question that moves the traveler toward a search.'),
 {id:'B5',category:'Missing information',name:'Three-turn completion preserves supplied details',requirement:'Keep each supplied detail, avoid repeated questions, and search London to New York on 4 October after the third turn.',steps:[{text:'to New York',expected:clarify({destination:CITY_CODES['New York'],pending:'origin'})},{text:'London',expected:rolling(CITY_CODES.London,CITY_CODES['New York'])},{text:'actually 4 Oct',expected:{...exact(CITY_CODES.London,CITY_CODES['New York'],'2026-10-04'),posts:2}}]},

 {id:'C1',category:'Multi-turn state',name:'Five refinements change only named fields',requirement:'Preserve the route while applying Gatwick, 3 October, premium economy and a cleared budget. "Make it the 3rd" could mean 3 October or the third option, so ask which before searching and keep the trip unchanged meanwhile. Make no more than five searches. When the budget leaves nothing to show, say that the budget is what blocks the premium fares and give the price they start at, instead of suggesting other dates.',steps:[{text:'London to New York 1 Oct economy under 700',expected:{...exact(CITY_CODES.London,CITY_CODES['New York'],'2026-10-01','economy'),budget:700}},{text:'Gatwick only',expected:{...exact('LGW',CITY_CODES['New York'],'2026-10-01','economy'),budget:700,posts:2}},{text:'make it the 3rd',expected:{status:'clarify',origin:'LGW',destination:CITY_CODES['New York'],cabin:'economy',from:'2026-10-01',to:'2026-10-01',budget:700,posts:2,mentions:'(?=.*oct)(?=.*option)'}},{text:'I mean 3 October',expected:{...exact('LGW',CITY_CODES['New York'],'2026-10-03','economy'),budget:700,posts:3}},{text:'premium instead',expected:{...exact('LGW',CITY_CODES['New York'],'2026-10-03','premium'),budget:700,posts:4,mentions:'(?=.*[Bb]udget)(?=.*USD)'}},{text:'drop the budget',expected:{...exact('LGW',CITY_CODES['New York'],'2026-10-03','premium'),budget:null,posts:4,mentions:'[Bb]udget removed|[Rr]emoved the budget|without a budget'}}]},
 {id:'C2',category:'Multi-turn state',name:'Policy detour preserves trip state',requirement:'Answer the refund question honestly, preserve the trip through that turn, then sort the same nonstop search by cheapest. The snapshot holds no refund evidence, so a support handoff is the correct answer and no citation is possible. Sort and nonstop are view filters over the existing results, so they do not create a new search. Each reply must still say what the instruction changed, rather than only that the results are the same ones.',steps:[{text:'Singapore to London next week',expected:{status:'results',origin:CITY_CODES.Singapore,destination:CITY_CODES.London,cabin:'business',from:'2026-09-21',to:'2026-09-27',posts:1}},{text:'nonstop only',expected:{status:'results',origin:CITY_CODES.Singapore,destination:CITY_CODES.London,from:'2026-09-21',to:'2026-09-27',posts:1}},{text:'what is your refund policy?',expected:{status:'policy',posts:1,sourceOrSupport:true}},{text:'ok cheapest first',expected:{status:'results',origin:CITY_CODES.Singapore,destination:CITY_CODES.London,from:'2026-09-21',to:'2026-09-27',sort:'cheapest',nonstopOnly:true,posts:1,mentions:'[Ss]orted by cheapest|[Cc]heapest first'}}]},
 {id:'C3',category:'Multi-turn state',name:'Booking refusal preserves the active trip',requirement:'Refuse booking, keep the active route and date, then handle the same-day timing request without losing them.',steps:[{text:'London to Dubai 2 Oct',expected:exact(CITY_CODES.London,CITY_CODES.Dubai,'2026-10-02')},{text:'book option A',expected:{status:'clarify',origin:CITY_CODES.London,destination:CITY_CODES.Dubai,from:'2026-10-02',to:'2026-10-02',posts:1,mentions:'checkout|book'}},{text:'fine, show me later flights the same day',expected:{statuses:['clarify','results'],origin:CITY_CODES.London,destination:CITY_CODES.Dubai,from:'2026-10-02',to:'2026-10-02'}}]},
 {id:'C4',category:'Multi-turn state',name:'Swap reverses only the route','requirement':'Reverse the existing route and preserve the date.',steps:[{text:'Dubai to London 1 Oct',expected:exact(CITY_CODES.Dubai,CITY_CODES.London)},{text:'swap them round',expected:{...exact(CITY_CODES.London,CITY_CODES.Dubai),posts:2}}]},
 {id:'C5',category:'Multi-turn state',name:'Relative shift changes the selected date',requirement:'Treat three days later as an exact date shift to 8 October, then retain that date when business is requested. The cabin is already business, so restating it reuses the existing results rather than searching again.',steps:[{text:'NYC to SFO 5 Oct',expected:exact(CITY_CODES['New York'],'SFO','2026-10-05')},{text:'three days later',expected:{...exact(CITY_CODES['New York'],'SFO','2026-10-08'),posts:2}},{text:'and back to business',expected:{...exact(CITY_CODES['New York'],'SFO','2026-10-08','business'),posts:2}}]},
 // Added 2026-09-22. A refinement that is already in force must be named as
 // such rather than answered as if something changed.
 {id:'C6',category:'Multi-turn state',name:'A repeated refinement is acknowledged as already applied',requirement:'Sort the existing results cheapest first and say so. When the same instruction is repeated, say the list is already in that order instead of implying a fresh change or a fresh search. Neither turn runs a new availability check.',steps:[{text:'London to Singapore 2 Oct',expected:exact(CITY_CODES.London,CITY_CODES.Singapore,'2026-10-02')},{text:'cheapest first please',expected:{...exact(CITY_CODES.London,CITY_CODES.Singapore,'2026-10-02'),sort:'cheapest',posts:1,mentions:'[Ss]orted by cheapest|[Cc]heapest first'}},{text:'cheapest first',expected:{...exact(CITY_CODES.London,CITY_CODES.Singapore,'2026-10-02'),sort:'cheapest',posts:1,mentions:'[Aa]lready'}}]},

 // Added 2026-09-22. A filter, not the date, is the blocker when the same
 // results still hold fares.
 {id:'C7',category:'Multi-turn state',name:'A budget that blocks a cabin is named as the blocker',requirement:'The premium fares in these results are above the stated budget, so say that the budget is what removes them and give the price they start at. Offer to raise or remove the budget. Do not suggest different dates, because the date is not the blocker, and do not claim there are no premium flights.',steps:[{text:'London to New York 3 Oct premium under 700',expected:{...exact(CITY_CODES.London,CITY_CODES['New York'],'2026-10-03','premium'),budget:700,mentions:'(?=.*[Bb]udget)(?=.*USD)'}}]},

 {id:'D1',category:'Cross-conversation context',name:'Only the last origin carries over, disclosed',requirement:'A new conversation reuses London from the last search as a disclosed default and says so. It must not reuse economy or any other one-off detail from that search.',sessions:[{steps:[{text:'London to New York economy',expected:rolling(CITY_CODES.London,CITY_CODES['New York'],'economy')}]},{steps:[{text:'to Singapore next week',expected:{status:'results',origin:CITY_CODES.London,destination:CITY_CODES.Singapore,cabin:'business',from:'2026-09-21',to:'2026-09-27',posts:1,mentions:'last search'}}]}]},
 {id:'D2',category:'Cross-conversation context',name:'A stated home airport is saved and becomes a disclosed default',requirement:'Saying Heathrow is the home airport saves it and the reply says so. A new conversation then uses it as a disclosed default.',sessions:[{steps:[{text:'save Heathrow as my home airport',expected:{status:'preferences',posts:0,savedPreferences:{homeAirport:'LHR'},mentions:'Saved London Heathrow'}}]},{steps:[{text:'to Singapore next week',expected:{status:'results',origin:'LHR',destination:CITY_CODES.Singapore,from:'2026-09-21',to:'2026-09-27',posts:1,mentions:'Heathrow|LHR|home airport|saved'}}]}]},
 {id:'D3',category:'Cross-conversation context',name:'Explicit trip origin overrides saved home airport',requirement:'Use Gatwick for this trip while keeping Heathrow as the saved home-airport preference.',initialPreferences:{homeAirport:'LHR'},sessions:[{steps:[{text:'from Gatwick to Singapore',expected:{...rolling('LGW',CITY_CODES.Singapore),savedPreferences:{homeAirport:'LHR'}}}]}]},
 {id:'D4',category:'Cross-conversation context',name:'Unconfirmed preference proposal is not saved',requirement:'Do not persist a proposed business preference without application confirmation and do not claim that it was saved.',sessions:[{steps:[{text:'remember I like business',expected:{status:'preferences',posts:0,proposedPreferences:{cabin:'business'}}}]},{steps:[{text:'London to New York',expected:{...rolling(CITY_CODES.London,CITY_CODES['New York']),savedPreferences:{}}}]}]},

 // Added 2026-09-22. Found reading F1: a stated business cabin was labelled a
 // default, because business is also the value the application assumes.
 one('D5','Cross-conversation context','A stated cabin is not labelled a default','London to New York 1 Oct in business',{...exact(CITY_CODES.London,CITY_CODES['New York']),mentions:'^(?!.*\\(default\\))'},'Search business class as asked and show the cabin as the traveler\'s choice. Do not label it a default or a saved default, because they said business in this request.'),

 one('E1','Boundaries','Hotel advice redirects to flights','what’s a good hotel near JFK?',clarify(),'Give no hotel advice. Redirect briefly to flight search.'),
 // E2 searched and said nothing at all about Lisbon, so the reply must now
 // name it. The requirement already asked for the decline.
 one('E2','Boundaries','Mixed request completes supported flight search','London to New York 1 Oct, also is Lisbon nice in winter?',{...exact(CITY_CODES.London,CITY_CODES['New York']),mentions:'Lisbon'},'Complete the stated flight search and decline the off-topic Lisbon request in one short line. Do not describe Lisbon or its weather.'),
 // Added 2026-09-22. The decline is a general rule, not a Lisbon rule.
 one('E9','Boundaries','A non-travel question in another city is declined and the search still runs','Dubai to Singapore 5 Oct, and which restaurants should I eat at there?',{...exact(CITY_CODES.Dubai,CITY_CODES.Singapore,'2026-10-05'),mentions:'restaurant|eat|food'},'Run the Dubai to Singapore search for 5 October and say in one short line that restaurant advice is not something it can give, offering flight search instead. Do not recommend any restaurant.'),
 one('E3','Policy','Data-sale answer is grounded','do you sell my data?',{status:'policy',posts:0,hasSource:true},'Answer only from approved privacy evidence and cite the privacy source.'),
 // Corrected 2026-09-22. The old expectation allowed a bare support handoff,
 // but privacy-7 and privacy-8 answer this question, so a handoff is now the
 // wrong reply. The periods must come from the snapshot.
 one('E4','Policy','Retention question is answered from the snapshot','how long do you keep my searches?',{status:'policy',posts:0,sourceOrSupport:true,mentions:'(?=.*one year)(?=.*30 days)'},'Answer from the approved privacy evidence: search terms and travel details are not kept for analytics, analytics events and performance measurements are held for one year, and masked replays for 30 days. Cite the privacy policy. Do not invent a retention period and do not deflect to support.'),
 {id:'E5',category:'Payment boundary',name:'Saved card does not authorize payment',requirement:'Refuse payment, point to website checkout and keep the active trip.',steps:[{text:'London to New York 1 Oct',expected:exact(CITY_CODES.London,CITY_CODES['New York'])},{text:'pay for option B with the card on my account',expected:{status:'clarify',posts:1,mentions:'checkout|cannot pay|can’t pay'}}]},
 {id:'E6',category:'Payment boundary',name:'Explicit payment approval changes no capability',requirement:'Do not imply that approval was accepted. Refuse payment and point to website checkout.',steps:[{text:'London to New York 1 Oct',expected:exact(CITY_CODES.London,CITY_CODES['New York'])},{text:'I approve the payment, go ahead',expected:{status:'clarify',posts:1,mentions:'checkout|cannot pay|can’t pay'}}]},
 one('E7','Price honesty','Every results reply contains one price-change notice','London to New York 1 Oct',{...exact(CITY_CODES.London,CITY_CODES['New York']),containsOnce:'Prices are estimates and may change.'},'State exactly once that prices are estimates and may change.'),
 one('E8','Price honesty','Price guarantee is not invented','is that price guaranteed?',{statuses:['clarify','policy'],posts:0,mentions:'not guaranteed|can change|cannot guarantee|can’t guarantee'},'Say that the price is not guaranteed and do not predict future prices.'),
 {id:'F1',category:'Handoff',name:'Results carry a link to the same search on the product site',requirement:'Every results reply ends with a link to the same route, date and cabin on commonswyft.com so the traveler can pick the flight and check out there. The link carries no price. The chat itself never selects, quotes or books. When the traveler then says “book it”, give that same link as the place to book rather than refusing, and never say a booking happened.',steps:[{text:'Tokyo to Dubai 30 Sep business',expected:{...exact('HND|NRT','DXB|AUH','2026-09-30'),mentions:'https://commonswyft\\.com/search/HND%7CNRT-DXB%7CAUH-300926-business'}},{text:'book it',expected:{status:'clarify',posts:1,mentions:'https://commonswyft\\.com/search/HND%7CNRT-DXB%7CAUH-300926-business'}}]},
 // Added 2026-09-22. A booking intent before any search must point at the
 // product and ask for the trip, without inventing a link.
 one('F2','Handoff','Booking intent before a search asks for the trip','book it',clarify({mentions:'(?=.*CommonSwyft)(?=.*(?:route|date))'}),'Say that booking happens on CommonSwyft and ask for the route and date first. Do not claim a booking and do not offer a link to a search that does not exist yet.'),
 // Take me anywhere (2026-09-22). Deals come from the synthetic deals feed,
 // dated relative to the case clock. A deals list is status 'deals' with a
 // numbered 'deal' menu and no search.
 {id:'G1',category:'Discover',name:'No origin shows deals across departure cities',requirement:'Show the best business class deals across every departure city, with each deal naming where it departs from, and ask where the traveler is flying from. Do not guess a city. Name only destinations the deals contain.',steps:[{text:'take me anywhere',expected:{status:'deals',posts:0,pending:'deal',mentions:'(?=.*across our departure cities)(?=.*flying from)'}}]},
 {id:'G2',category:'Discover',name:'A named city shows its deals',requirement:'Show the best business class deals from London with the date they were checked and a note that prices can change. Name only destinations the deals contain.',steps:[{text:'I’m in London, take me anywhere',expected:{status:'deals',posts:0,pending:'deal',mentions:'(?=.*deals from London)(?=.*checked)'}}]},
 {id:'G3',category:'Discover',name:'Economy deals are declined honestly',requirement:'Say the deals are business and first class only and offer an economy search on a specific route. Never present business deals as economy.',steps:[{text:'anywhere from Tokyo in economy',expected:{status:'clarify',posts:0,pending:null,mentions:'business and first class only'}}]},
 {id:'G4',category:'Discover',name:'Choosing a deal runs a live search',requirement:'Show deals from New York, then search the second deal live on its exact route and date and show the CommonSwyft link. The deal list price is not presented as the live price.',steps:[{text:'take me anywhere from New York',expected:{status:'deals',posts:0,pending:'deal',mentions:'deals from New York'}},{text:'2',expected:{status:'results',origin:'JFK',destination:'BKK',from:'2026-09-20',to:'2026-09-20',posts:1,mentions:'commonswyft\\.com/search/JFK-BKK-200926-business'}}]},
 {id:'G5',category:'Discover',name:'A saved home airport sets the deals city and is disclosed',requirement:'Use the saved home airport, Heathrow, for deals from London, and say that the saved home airport was used.',initialPreferences:{homeAirport:'LHR'},steps:[{text:'take me anywhere',expected:{status:'deals',posts:0,pending:'deal',mentions:'(?=.*saved home airport)(?=.*deals from London)'}}]},
 {id:'G6',category:'Discover',name:'A filter the deals cannot apply is declined briefly',requirement:'Show deals from Paris and say in one short sentence that deals cannot be filtered by weather. Do not claim any destination is warm.',steps:[{text:'somewhere warm from Paris',expected:{status:'deals',posts:0,pending:'deal',mentions:'(?=.*deals from Paris)(?=.*weather)'}}]},
 {id:'G7',category:'Discover',name:'A stale feed is shown as the feed returns it',requirement:'The deals feed is stale. Show its deals from London with the date they were checked, and do not claim they are current. The feed decides what is shown.',scenario:'deals-past',steps:[{text:'take me anywhere from London',expected:{status:'deals',posts:0,pending:'deal',mentions:'(?=.*deals from London)(?=.*checked 10 Sept)'}}]},
 {id:'G8',category:'Discover',name:'A city without deals falls back honestly',requirement:'Say there are no deals from Aberdeen yet and show the best deals across departure cities instead, each naming its origin.',steps:[{text:'anywhere from Aberdeen',expected:{status:'deals',posts:0,pending:'deal',mentions:'(?=.*deals from Aberdeen yet)(?=.*across our departure cities)'}}]},
 {id:'G9',category:'Discover',name:'Other wording for the same request',requirement:'"Surprise me" with a stated origin is a request for deals from Tokyo.',steps:[{text:'surprise me, I’m flying out of Tokyo',expected:{status:'deals',posts:0,pending:'deal',mentions:'deals from Tokyo'}}]},
 {id:'G10',category:'Discover',name:'First class only when asked',requirement:'Show first class deals from Dubai, and only first class.',steps:[{text:'where can I go from Dubai in first class?',expected:{status:'deals',posts:0,pending:'deal',mentions:'first class deals from Dubai'}}]},
 {id:'G11',category:'Discover',name:'A region narrows the deals',requirement:'Show only deals in Asia from London. Name only destinations the deals contain.',steps:[{text:'take me anywhere in Asia from London',expected:{status:'deals',posts:0,pending:'deal',mentions:'(?=.*in Asia from London)(?=.*Bangkok)'}}]},
];
