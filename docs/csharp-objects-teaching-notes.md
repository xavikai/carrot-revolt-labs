# Code Lab 02 · Objects — teaching notes

Code Lab 02 continues Code Lab 01 with the same editor, stepping, Memory panel and challenge types. The goal is to understand the ideas every Unity script uses: classes, objects, references, lists, Vector3 and the Update loop.

## What the Memory panel shows now

- A variable of a class holds an **arrow** (→ #3) to an object in the **heap**. Each object has a number and a colour, so two arrows to the same object are easy to spot.
- `null` is drawn as an empty arrow.
- **Structs** (Vector3) are drawn inside the variable: they are values, copied when assigned.
- Objects that nothing points to any more are **faded** ("no references"): this is what garbage collection cleans up.
- Lists are objects in the heap, drawn as numbered boxes with their `Count`.

## The Unity-like layer

- `class Ball : MonoBehaviour` gives every object a `transform` with `position` (a Vector3).
- `Scene.Add(obj)` puts it in the scene (in Unity you attach the script to a GameObject instead). Then the lab calls `Start()` once and `Update()` on every object, every frame, at 20 frames per second (`Time.deltaTime` = 0.05).
- Objects are drawn as spheres at their position, with a dot for every frame (like the Motion Path of the Animation Lab). A public `Color color` field sets the colour.
- `Debug.Log` prints in the Console, like `Console.WriteLine`.

## Levels

0. **Classes and objects** — blueprint vs object, own fields, CS0122 (private by default), constructors, methods that use the object's fields.
1. **References and null** — two names for one object, a method that changes an object (compare with the int parameter of Code Lab 01), NullReferenceException, `==` compares arrows, checking `!= null`.
2. **Lists** — Add/Count, what Remove does to positions, lists of objects, InvalidOperationException when removing inside foreach (fix: backwards for + RemoveAt), a randomized street built from a list.
3. **Structs and Vector3** — vector maths, a struct is copied (compare with r-1), floats need an f, CS1612 on `transform.position.y`, moving towards a target with `normalized`.
4. **Update and time** — frame by frame, why `Time.deltaTime`, falling with gravity, the bouncing ball simulated in code (link with the Animation Lab: the same curve, now from physics), five independent balls from one class.
5. **Inheritance** — virtual/override vs hidden methods (CS0108), CS0506 when virtual is missing, a SuperBall that overrides one method and inherits everything else.
6. **Ready for Unity** — what changes when the script goes into Unity, and a free scene.

## Differences from Unity

- `Scene.Add` and `new` for MonoBehaviours exist only in the lab (Unity creates them when you attach a script).
- `Color.Red` (the lab's colours) instead of Unity's `Color.red`, and the colour is a field instead of a material.
- No properties `{ get; set; }`, static members, interfaces or generics of your own; one method name per class (no overloads).
- Classes must be written after the main program, as C# requires for top-level programs (CS8803).
