/**
 * Which question kinds each existing Class 1 Mathematics lesson draws on (see mathBank.ts for the
 * spec format "kind,kind:arg@lo-hi#arg"). Keyed by chapter order; `title` is checked against the
 * database chapter so a re-ordered or renamed chapter is skipped, never given the wrong questions.
 * Lessons are listed in lesson order. Ranges keep every number inside what the lesson teaches.
 */
export interface ChapterPlan {
  title: string;
  /** Level 1 foundation → 4 challenge; revision chapters are 4. */
  level: 1 | 2 | 3 | 4;
  lessons: string[];
}

export const MATH_PLAN: Record<number, ChapterPlan> = {
  1: { title: 'Counting 1 to 10', level: 1, lessons: ['count,matchQty,missing,ba@1-5', 'count,matchQty,missing,ba@6-10', 'name,count,missing,ba,matchQty@1-10'] },
  2: { title: 'Numbers 11 to 20', level: 1, lessons: ['count,tens,missing,ba@11-15', 'count,tens,missing,ba@16-20', 'tens,count,cmp,ba@11-20'] },
  3: { title: 'Shapes Around Us', level: 1, lessons: ['shapeName,shapeSides,shapeObj,shapeCount,tfShape#circle', 'shapeName,shapeSides,shapeObj,tfShape#square,rectangle', 'shapeName,shapeSides,shapeObj,shapeCount,tfShape#triangle', 'shapeObj,odd,shapeName,shapeSides,riddle:shape'] },
  4: { title: 'Comparing Things', level: 1, lessons: ['measure:long,measure:tall,tfMeasure:long,tfMeasure:tall', 'measure:heavy,tfMeasure:heavy,measure:big', 'cmpGroups,cmpGroups:more,count@1-8', 'tfMeasure:fe,tfMeasure:near,cmpGroups@1-8'] },
  5: { title: 'Zero, One More and One Less', level: 1, lessons: ['zero,count@0-5', 'oneMore,ba:after@1-9', 'oneLess,ba:before@1-10', 'order,cmp@1-10'] },
  6: { title: 'Numbers 21 to 50', level: 2, lessons: ['missing,ba,between,tens@21-30', 'missing,ba,between,tens@31-40', 'missing,ba,between,tens,cmp@41-50'] },
  7: { title: 'Numbers 51 to 100', level: 2, lessons: ['missing,ba,between@51-70', 'missing,ba,between,cmp@71-100', 'skip:10,missing@1-100', 'tens,cmp,ba@51-100'] },
  8: { title: 'Number Names and Neighbours', level: 2, lessons: ['name@1-10', 'name@11-20', 'name:tens@10-100', 'ba,between,missing,name@1-20'] },
  9: { title: 'Greater, Less, Equal and Order', level: 2, lessons: ['cmp,cmpGroups,tf:cmp@1-20', 'cmpGroups,cmp,tf:cmp@1-10', 'order:asc,cmp@1-20', 'order:desc,cmp@1-20'] },
  10: { title: 'Adding with Objects and Pictures', level: 2, lessons: ['addObj,addStory@2-6', 'addObj,addStory@2-10', 'addObj,addEq,tf:add@2-10'] },
  11: { title: 'Adding Within 10', level: 3, lessons: ['nline:add,addEq,addObj@2-10', 'addEq:01,addObj,tf:add@1-10', 'doubles,addEq,missAdd@2-10', 'makeTen,missAdd,addEq@2-10'] },
  12: { title: 'Adding Within 20', level: 3, lessons: ['addEq:ten,addObj@11-20', 'addEq:on,addObj@11-20', 'addEq:cross,makeTen,missAdd@11-20', 'addStory,addEq@11-20'] },
  13: { title: 'Taking Away with Objects', level: 2, lessons: ['subObj,subStory@2-6', 'subObj,subStory@2-10', 'subObj,subEq,tf:sub@2-10'] },
  14: { title: 'Subtracting Within 10', level: 3, lessons: ['nline:sub,subEq,subObj@2-10', 'subEq:01,subObj,tf:sub@2-10', 'fam,subEq,addEq@2-10', 'subStory,subEq@2-10'] },
  15: { title: 'Subtracting Within 20', level: 3, lessons: ['subEq:teen,subObj@11-20', 'subEq,subObj,tf:sub@11-20', 'subEq:cross,subEq@11-20', 'fam,subStory,subEq@11-20'] },
  16: { title: 'Quick Maths in Your Head', level: 4, lessons: ['makeTen,mental@1-10', 'doubles,mental@1-10', 'addEq:ten,addEq:cross,mental@11-20', 'mental,subEq,fam@1-20'] },
  17: { title: 'Story Sums: Putting Together', level: 3, lessons: ['addStory@2-10', 'addStory@2-20', 'addStory,riddle:more@2-20'] },
  18: { title: 'Story Sums: Taking Away', level: 3, lessons: ['subStory@3-10', 'subStory@3-20', 'mixStory,riddle:less@3-20'] },
  19: { title: 'Equal Groups', level: 3, lessons: ['groups,repAdd', 'groups,repAdd,share', 'share,groups'] },
  20: { title: 'Skip Counting', level: 3, lessons: ['skip:2,missing@1-20', 'skip:5,missing@1-30', 'skip:10,skip:5,missing@1-100'] },
  21: { title: 'Day, Week and Year', level: 3, lessons: ['dayNight,parts,tfTime', 'parts,dayNight,tfTime', 'days,ydt', 'months,days'] },
  22: { title: 'Reading the Clock', level: 3, lessons: ['clockFact,clock', 'clock,clockRev,clockFact', 'clock,clockRev,parts'] },
  23: { title: 'Money: Coins and Notes', level: 3, lessons: ['coinSum,tfMoney,cmpMoney', 'cmpMoney,tfMoney,coinSum', 'price,spend,coinSum', 'makeAmt,spend,coinSum'] },
  24: { title: 'Patterns All Around', level: 3, lessons: ['pattern:ab,pattern:aab,odd', 'pattern:abc,pattern:abb,pattern:aab', 'patNum,skip:2,skip:5@1-20'] },
  25: { title: 'Sorting and Pictures That Count', level: 3, lessons: ['sortCount,oddCat', 'sortCount,cmpGroups,count@1-8', 'pictograph,sortCount'] },
  26: { title: 'Where Is It?', level: 3, lessons: ['tfPos:lr,lineup:lr', 'tfPos:ab,lineup', 'lineup:between,tfPos,lineup'] },
  27: { title: 'Mixed Story Problems', level: 4, lessons: ['addStory,subStory,spend,price@2-20', 'ydt,days,addStory,subStory@2-10', 'twoStep,mixStory,spend'] },
  28: { title: 'Revision: Numbers and Operations', level: 4, lessons: ['ba,missing,between,cmp,order@1-20', 'addEq,subEq,addStory,subStory,missAdd@1-20', 'groups,skip:2,skip:5,skip:10,repAdd'] },
  29: { title: 'Revision: Shapes, Time, Money and Patterns', level: 4, lessons: ['shapeName,shapeSides,measure:long,measure:heavy,tfMeasure:tall,odd', 'clock,clockRev,parts,days,spend,price', 'pattern,sortCount,pictograph,lineup,oddCat'] },
};
