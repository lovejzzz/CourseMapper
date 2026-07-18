export const SCION_LESSON_KERNEL_PILOT_PROMPT = `Course: Geology Inference and Feedback Audit
Lessons:
[{"lessonId":"lesson-3","title":"Plate-boundary processes","objectives":"Use supplied claims to make a defensible distinction. Quality focus: Stress source coverage, answer-feedback consistency, misconception validity, key-term precision, and feedback instructionality.","topics":"Claim 0: Plate boundaries are classified as divergent, convergent, or transform according to whether plates separate, approach, or slide alongside one another. Claim 1: Divergent boundaries move apart and form new crust, whereas convergent boundaries move together and can subduct crust. Claim 2: Transform boundaries accommodate plates moving side by side rather than creating or subducting crust.","readings":"Steven Earle, Physical Geology – 2nd Edition (2019), chapter 10 summary, BCcampus Open Education"}]
Return ONLY valid JSON matching the kernel shape from the instructions.`;

export const SCION_LESSON_KERNEL_LOCAL_PILOT_RESPONSE = {
  lessons: [
    {
      lessonId: 'lesson-3',
      facts: [
        'Plate boundaries are classified by whether plates separate, approach, or slide alongside one another. This classification determines the fundamental geological process occurring at',
        'Divergent boundaries move apart and form new crust through processes like seafloor spreading. This process involves the creation of new lithosphere. This is a key feature of the',
        'Convergent boundaries involve plates moving together, which can result in crustal subduction or mountain building. Subduction is a primary mechanism at',
        'Transform boundaries accommodate plates sliding past each other horizontally without creating or destroying crust. This boundary type is characterized by',
        'The classification of plate boundaries directly relates to the resulting tectonic activity, such as volcanism or intense seismicity.',
      ],
      keyTerms: [
        {
          tr: 'Plate boundaries',
          df: 'The distinct interfaces where tectonic plates interact, categorized by their relative motion.',
          eg: 'The Mid-Atlantic Ridge is a classic example of a divergent plate boundary.',
          mi: 'Plate boundaries are simply lines where tectonic plates meet and interact.',
          cx: 'Plate boundaries are classified specifically by the type of motion: divergent, convergent, or transform.',
        },
        {
          tr: 'Divergent boundaries',
          df: 'Tectonic boundaries where plates move apart, leading to the formation of new oceanic crust.',
          eg: 'The spreading center of the East Pacific Rise exemplifies a divergent boundary.',
          mi: 'Divergent boundaries always result in the formation of continental crust. This is incorrect.',
          cx: 'Divergent boundaries form new crust, typically oceanic crust, as plates move apart.',
        },
        {
          tr: 'Transform boundaries',
          df: 'Tectonic boundaries where plates slide horizontally past one another without crust creation or destruction.',
          eg: 'The San Andreas Fault represents a major transform boundary accommodating lateral plate motion.',
          mi: 'Transform boundaries are the same as divergent boundaries but involve plates moving apart.',
          cx: 'Transform boundaries involve plates sliding side-by-side, not moving apart or creating new crust.',
        },
      ],
      scenario: {
        su: 'A geologist is analyzing seismic data showing continuous shallow earthquakes along a major fault line. The constraint is that the data only shows strike-slip motion, not significant vertical displacement.',
        ma: 'Seismic data showing continuous shallow earthquakes along a major fault line indicating lateral plate motion.',
      },
      mc: [
        {
          q: 'Which statement correctly distinguishes between divergent and transform plate boundaries?',
          op: [
            'Divergent boundaries create new crust while transform boundaries destroy existing crust.',
            'Divergent boundaries move plates apart, whereas transform boundaries accommodate plates sliding side-by-side.',
            'Transform boundaries are characterized by subduction, while divergent boundaries involve crustal creation.',
            'Divergent boundaries always result in volcanic activity, while transform boundaries are always cold and stable.',
          ],
          ai: 1,
          fi: [1],
          ex: 'The key wins because it correctly identifies the fundamental difference: divergence creates crust, while transform accommodates sliding. Option B correctly describes the motion and crustal outcome.',
        },
        {
          q: 'A researcher observes a region where two plates are moving toward each other and one is sinking beneath the other. What type of plate boundary is this?',
          op: [
            'A divergent boundary where new oceanic crust is being formed.',
            'A transform boundary where plates are sliding past each other horizontally.',
            'A convergent boundary where plates approach and one subducts beneath the other.',
            'A divergent boundary where both plates are moving away from each other.',
          ],
          ai: 2,
          fi: [2],
          ex: 'The key fits the case because the description of plates approaching and one subducting matches the definition of a convergent boundary. Option C describes the correct process of convergence and subduction.',
        },
      ],
    },
  ],
};

export const SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE = {
  lessons: [
    {
      lessonId: 'lesson-3',
      facts: [
        'Plate boundaries are commonly classified as divergent, convergent, or transform zones.',
        'Divergent boundaries separate plates and create new crust along the spreading margin.',
        'Convergent boundaries move plates together and may subduct one plate beneath another.',
        'Transform boundaries let plates slide past each other without making or destroying crust.',
        'Boundary type is inferred from relative plate motion, not from one isolated landform.',
      ],
      keyTerms: [
        {
          tr: 'divergent boundaries',
          df: 'A plate-margin category defined by plates moving apart and crust forming at the gap.',
          eg: 'Rifted seafloor where magma fills widening space between two separating plates.',
          mi: 'Any crack in rock must mean a divergent boundary is present.',
          cx: 'Cracks alone are insufficient; the defining clue is plates separating and new crust forming.',
        },
        {
          tr: 'convergent boundaries',
          df: 'A plate-margin category where plates approach each other, often producing subduction or collision.',
          eg: 'An oceanic plate descends beneath another plate along a trench system.',
          mi: 'Any mountain range must come from transform motion between plates.',
          cx: 'Transform motion slides laterally, while convergence brings plates together and can subduct crust.',
        },
        {
          tr: 'transform boundaries',
          df: 'A plate-margin category in which plates move sideways past one another without crust creation.',
          eg: 'Two blocks of crust offset along a fault while neither side is consumed.',
          mi: 'If plates slide side by side, the boundary must be divergent because motion is active.',
          cx: 'Side-by-side sliding defines transform motion, whereas divergent motion requires separation and new crust.',
        },
      ],
      scenario: {
        su: "A field team maps a faulted coastline where two blocks are offset, but no ridge axis or trench is visible. They must label the plate boundary type before tonight's briefing, using only the map and plate-motion arrows.",
        ma: 'Evidence packet: fault map, motion arrows showing lateral displacement, coastal cross-section, and notes on ridge and trench absence.',
      },
      mc: [
        {
          q: 'Which boundary type best matches plates moving apart, plates colliding, and plates sliding past one another, respectively, when using motion direction to classify the margin?',
          op: [
            'Divergent, convergent, transform',
            'Convergent, divergent, transform',
            'Transform, convergent, divergent',
            'Divergent, transform, convergent',
          ],
          ai: 0,
          fi: [0],
          ex: 'The motion sequence matches separation, then approach, then sideways sliding. The closest distractor swaps separation and approach, which reverses the two distinct boundary types.',
        },
        {
          q: 'A map shows two crustal blocks offset sideways along a fault, with no ridge axis and no trench or subduction feature. Which boundary type is best supported?',
          op: [
            'Divergent boundary, because new crust must be forming',
            'Convergent boundary, because one plate must be descending',
            'Transform boundary, because plates are sliding side by side',
            'Convergent boundary, because the offset indicates crustal shortening',
          ],
          ai: 2,
          fi: [3],
          ex: 'Sideways offset with no ridge or trench fits transform motion. The closest distractor invokes crust creation, but that would require separation and a spreading center.',
        },
      ],
    },
  ],
};
