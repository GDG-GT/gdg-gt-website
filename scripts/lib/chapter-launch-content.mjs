import { randomUUID } from "node:crypto";
import { formDefinitionSchema } from "../../shared/forms.ts";
import { linktreeCreate, linktreeLink } from "../../shared/linktree.mjs";
export function chapterLaunchContent() {
  const sections = [
    { id:randomUUID(), title:"Your connection to Georgia Tech", description:"Your name and email are required at submission. Tell us a little more about your studies." },
    { id:randomUUID(), title:"Where you would like to contribute", description:"Choose the work that interests you. You do not need a previous board title to apply." },
    { id:randomUUID(), title:"Your experience and availability", description:"Examples from class, projects, work or volunteering are all welcome." },
    { id:randomUUID(), title:"Review and submit", description:"Review your answers before submitting. You can request an exact copy at the email address you enter." },
  ];
  const field = (section,type,label,required,changes={}) => ({id:randomUUID(),type,label,description:"",required,options:[],optionIds:[],sectionId:sections[section].id,sensitive:false,...changes});
  const choices = values => ({ options:values,optionIds:values.map(()=>randomUUID()) });
  const definition = formDefinitionSchema.parse({
    title:"Executive board application",
    description:"Help shape the developer community at Georgia Tech. Tell us what you would like to build, the experience you bring and how you would support the chapter. We welcome technical, creative and organizational experience. Submitting an application does not confirm a board position.",
    sections,
    fields:[
      field(0,"short","Major or program of study",true,{maxLength:150}),
      field(0,"dropdown","Current level of study",true,choices(["Undergraduate student","Master's student","Doctoral student","Other Georgia Tech affiliation"])),
      field(0,"short","Expected graduation term",true,{description:"For example, Spring 2028. If your program has a different timeline, briefly explain.",maxLength:150}),
      field(1,"checkbox","Which areas would you most like to contribute to?",true,{...choices(["Technical projects and workshops","Events and chapter programs","Community and member experience","Design, content and communications","Partnerships and sponsorships","Operations and chapter planning"]),maxChoices:3,description:"Choose up to three areas. These describe interests rather than confirmed role openings."}),
      field(1,"long","Why would you like to join the executive board?",true,{maxLength:2000,description:"What draws you to GDG at Georgia Tech, and what would you like to help the chapter do?"}),
      field(1,"long","What is one idea you would like to bring to the chapter?",true,{maxLength:2000,description:"Describe the audience, why the idea matters and a practical first step."}),
      field(2,"long","Tell us about something you helped build, organize or improve",true,{maxLength:2500,description:"Explain your contribution and what you learned. A small, specific example is welcome."}),
      field(2,"url","Portfolio, GitHub, LinkedIn or project link",false,{description:"Optional. Share one link that helps us understand your work."}),
      field(2,"dropdown","What weekly commitment is realistic for you?",true,choices(["1–2 hours","3–5 hours","6–8 hours","More than 8 hours","My availability varies; I will explain below"])),
      field(2,"long","Availability and commitments we should know about",false,{maxLength:1500,description:"Optional. Share scheduling constraints, busy periods or anything that would help us plan an interview."}),
      field(2,"file","Resume or short experience summary",false,{sensitive:true,maxFiles:1,maxFileBytes:10485760,allowedMime:["application/pdf"],description:"Optional PDF, up to 10 MiB. Your written answers are sufficient; an upload is not required."}),
      field(3,"long","Anything else you would like us to know?",false,{maxLength:1500}),
      field(3,"consent","I confirm that my answers are accurate and understand that the chapter will use my application and contact information for board recruitment.",true,{sensitive:true,description:"Application responses are private to authorized chapter reviewers and retained for up to 180 days, subject to the chapter's privacy and deletion workflows."}),
    ],
    settings:{access:"public",limit:0,resume:true,editing:true,receipts:false,confirmation:"Thank you for applying to the GDG at Georgia Tech executive board. Your application has been received. The chapter can contact you at the email address you provided about next steps.",opensAt:"",closesAt:"",oneResponse:false,retentionDays:180,hold:false,closedMessage:"Executive board applications are not accepting responses right now. Please contact gdg@gatech.edu with questions.",indexable:false,review:true,theme:"coral",progress:true,shuffleQuestions:false,shuffleOptions:false},
  });
  const profile=linktreeCreate.parse({teamId:null,record:{username:"gdg-gt",displayName:"GDG at Georgia Tech",bio:"Build, learn and find your people at Georgia Tech.\nEvents, chapter opportunities and the links you need to get involved.",avatarUrl:"",background:{type:"color",value:"#f8d8c6"},theme:"light"}});
  const entries=[
    ["Apply to the executive board","/forms/executive-board-application","Help shape the chapter. Share your interests, experience and ideas.","form",true],
    ["Find your next event","https://gdggt.dev/events","Workshops, build sessions and community events.","calendar"],
    ["Join the community","https://gdggt.dev/contact?type=membership","Introduce yourself and learn how to get involved.","community"],
    ["Explore learning resources","/resources","Tools, guides and learning opportunities for builders.","code"],
    ["Meet the chapter team","/team","The people helping the community learn and grow.","community"],
    ["See the community in action","/gallery","Photos and highlights from chapter activities.","link"],
    ["Partner with the chapter","/sponsors","Support student builders, programs and opportunities.","link"],
    ["Build with us on GitHub","https://github.com/GDG-GT","Chapter projects and open-source work.","code"],
    ["Contact GDG at Georgia Tech","/contact","Questions, collaboration ideas or a hello for the chapter.","mail"],
  ];
  const links=entries.map(([title,url,description,icon,featured])=>linktreeLink.parse({title,url,description,icon,buttonStyle:featured?"filled":"default",buttonColor:featured?"#b44231":"#fff8f2",textColor:featured?"#fff8f2":"#312b28",embedType:"none",showClickCount:false}));
  return {form:{slug:"executive-board-application",teamId:null,definition},profile,links};
}
