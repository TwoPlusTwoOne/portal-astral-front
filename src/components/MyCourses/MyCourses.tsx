import * as React from 'react';
import {Future, Option, Vector} from "prelude.ts";
import {ok} from 'resulty';
import {
    Button,
    LinearProgress,
    Modal,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
} from "@material-ui/core";
import {DateTime, Interval} from 'luxon'
import * as RemoteData from "@devexperts/remote-data-ts";
import {at, field, string, succeed, array, number} from "jsonous";
import Decoder from "jsonous/Decoder";

import {iso, Newtype} from "newtype-ts";
import session from "../../utils/session";
import {baseUrl} from "../../utils/api";


// ---- HELPER TYPES ----


type WebData<T> = RemoteData.RemoteData<string, T>

interface CourseID extends Newtype<{ readonly CourseID: unique symbol }, string> {
}

interface ExamID extends Newtype<{ readonly ExamID: unique symbol }, string> {
}

interface StudentID extends Newtype<{ readonly ExamID: unique symbol }, string> {
}

const isoCourseID = iso<CourseID>();
const isoExamID = iso<ExamID>();
const isoStudentID = iso<StudentID>();


// ---- MODEL TYPES ----


type Course = {
    id: CourseID
    subjectName: string,
    interval: Interval,
}

type Student = {
    id: StudentID,
}

type Exam = {
    id: ExamID
    date: DateTime,
    grade: Option<number>,
}

type Model = {

    // -- Context --
    currentUser: Option<Student>
    currentDate: Option<DateTime>

    // -- Main table --
    courses: WebData<Vector<Course>>,

    // -- Modal --
    selectedCourse: Option<Course>,
    modalExams: WebData<Vector<Exam>>,
}

// ---- INITIAL MODEL ----

const initial: Model = {
    currentUser: Option.none(),
    currentDate: Option.none(),

    courses: RemoteData.initial,

    selectedCourse: Option.none(),
    modalExams: RemoteData.initial,
}

// const demo: Model = {
//     currentUser: Option.none(),
//     currentDate: Option.none(),
//
//     courses: RemoteData.success(
//         Vector.of(
//             {
//                 id: isoCourseID.wrap('c1'),
//                 subjectName: "Alg 1",
//                 exams: ["e1", "e2", "e3"].map(isoExamID.wrap),
//                 interval: Interval.fromDateTimes(DateTime.utc(2017, 3, 13), DateTime.utc(2017, 5, 15)),
//             },
//             {
//                 id: isoCourseID.wrap('c2'),
//                 subjectName: "Alg 2",
//                 exams: ["e1", "e2"].map(isoExamID.wrap),
//                 interval: Interval.fromDateTimes(DateTime.utc(2018, 3, 13), DateTime.utc(2018, 12, 15)),
//             },
//         ),
//     ),
//
//     selectedCourse: Option.none(),
//
//     modalExams: RemoteData.success(
//         Vector.of(
//             {id: isoExamID.wrap("e1"), date: DateTime.local(2018, 3, 11), grade: Option.some(8.0)},
//             {id: isoExamID.wrap("e2"), date: DateTime.local(2018, 3, 12), grade: Option.some(4.0)},
//             {id: isoExamID.wrap("e3"), date: DateTime.local(2018, 3, 13), grade: Option.some(7.0)},
//         ),
//     ),
// };


// ---- COMPONENT ----


export class MyCourses extends React.Component<{}, Readonly<Model>> {

    readonly state: Model = initial;

    constructor(props) {
        super(props);

        this.unenroll = this.unenroll.bind(this);
        this.openExamsModal = this.openExamsModal.bind(this);
        this.closeExamsModal = this.closeExamsModal.bind(this);

    }

    componentDidMount() {

        // TODO improve session handling, maybe component should assume a student
        if (session.getUserType() != 'Student')
            throw new Error("Trying to access MyCourses component with a non-student user");

        let userOption: Option<Student> =
            Option.ofNullable(sessionStorage.getItem('user'))
                .flatMap(json => userDecoder.decodeJson(json)
                    .cata({
                        Err: err => {
                            console.error(err);
                            return Option.none()
                        },
                        Ok: user => Option.some(user),
                    }))

        this.setState({
            currentUser: userOption,
        });

        userOption.ifSome(user =>
            studentCourses(user.id)
                .onComplete(res => {
                    let examsWebData: WebData<Vector<Course>> = res.match({
                        Left: l => RemoteData.failure(l.toString()) as WebData<Vector<Course>>,
                        Right: v => RemoteData.success(v),
                    });

                    this.setState({courses: examsWebData})
                }),
        )
        // ----------------------------------------------------------------------

        setInterval(
            () => this.updateTime(),
            1000,
        );

    }

    updateTime() {
        this.setState(
            (prevState: Model) => ({
                ...prevState,
                currentDate: Option.some(DateTime.local()),
            }),
        )
    }

    openExamsModal(course: Course, studentId: StudentID) {
        this.setState({
            selectedCourse: Option.of(course),
            modalExams: RemoteData.pending,
        })


        courseStudentExams(course.id)(studentId)
            .onComplete(res => {
                let examsWebData: WebData<Vector<Exam>> = res.match({
                    Left: l => RemoteData.failure(l.toString()) as WebData<Vector<Exam>>,
                    Right: v => RemoteData.success(v),
                });

                this.setState({modalExams: examsWebData})
            })

        // interval(3000).pipe(
        //     take(1),
        // ).subscribe(_ => this.setState({modalExams: demo.modalExams}))
    }

    closeExamsModal() {
        this.setState(
            (prevState: Model): Model => ({
                ...prevState,
                selectedCourse: Option.none(),
                modalExams: RemoteData.initial,
            }),
        )
    }

    unenroll(courseId: CourseID, studentId: StudentID) {

    }

    render(): React.ReactNode {

        let model = this.state;

        return model.courses.foldL(
            () => <LinearProgress/>,
            () => <LinearProgress/>,
            failure => <div>Error loading courses!</div>,
            courses => Option.liftA2(
                (user: Student, currDate: DateTime): React.ReactNode => {

                    let coursesInProgress = courses.filter(c => c.interval.contains(currDate))
                    let finishedCourses = courses.filter(c => c.interval.isBefore(currDate))

                    return (
                        <div>
                            <h1>Courses in progress</h1>
                            {coursesTable(courseInProgressRow(this.openExamsModal)(this.unenroll)(user.id))(coursesInProgress)}

                            <h1>Finished courses</h1>
                            {coursesTable(courseFinishedRow(this.openExamsModal)(user.id))(finishedCourses)}


                            <Modal
                                open={model.selectedCourse.isSome()}
                                onClose={this.closeExamsModal}
                            >
                                {/* spread operator can be used to make mixins */}
                                <Paper style={
                                    {
                                        ...translateCenter,
                                        position: "absolute",
                                        minWidth: "50%",
                                        maxWidth: "70%",
                                        padding: "20px",
                                    }
                                }>
                                    {model.modalExams.foldL(
                                        () => <LinearProgress/>,
                                        () => <LinearProgress/>,
                                        (failure) => <p>{failure}</p>,
                                        (exams) => examTable(exams),
                                    )}
                                </Paper>
                            </Modal>
                        </div>
                    )
                })(model.currentUser, model.currentDate)
                .match({
                    Some: render => render,
                    None: () => <LinearProgress/>,
                }),
        )
    }
}

const coursesTable = (rowFn: (course: Course) => React.ReactNode) => (courses: Vector<Course>): React.ReactNode =>
    courses.isEmpty() ?
        <p>No courses!</p> :
        <Paper>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Subject</TableCell>
                        <TableCell>Start Date</TableCell>
                        <TableCell>End Date</TableCell>
                        <TableCell> </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {courses.map(rowFn)}
                </TableBody>
            </Table>
        </Paper>

const courseRow = (actions: React.ReactNode) => (course: Course): React.ReactNode => {
    return (
        <TableRow key={isoCourseID.unwrap(course.id)}>
            <TableCell>{course.subjectName}</TableCell>
            <TableCell>{course.interval.start.setLocale('es-AR').toLocaleString(DateTime.DATE_SHORT)}</TableCell>
            <TableCell>{course.interval.end.setLocale('es-AR').toLocaleString(DateTime.DATE_SHORT)}</TableCell>
            <TableCell>{actions}</TableCell>
        </TableRow>
    );
};

const courseInProgressRow =
    (onExamsClick: (course: Course, studentId: StudentID) => any) => (onUnenrollClick: (courseId: CourseID, studentID: StudentID) => any) => (studentId: StudentID) => (course: Course) => {
        return (
            courseRow
            (
                // TODO user id
                <div>
                    <Button onClick={() => onUnenrollClick(course.id, studentId)} variant="contained"
                            color="primary"
                            style={{marginRight: '5px'}}>
                        Unenroll
                    </Button>
                    <Button onClick={() => onExamsClick(course, studentId)} variant="contained" color="primary">
                        Exams
                    </Button>
                </div>,
            )
            (course)
        )
    };

const courseFinishedRow = (onExamsClick: (course: Course, studentId: StudentID) => any) => (studentId: StudentID) => (course: Course) => {
    return (
        courseRow
        (
            <div>
                <Button onClick={() => onExamsClick(course, studentId)} variant="contained" color="primary">
                    Exams
                </Button>
            </div>,
        )
        (course)
    );
};

const examTable = (exams: Vector<Exam>): React.ReactNode => {
    return (
        exams.isEmpty() ?
            <p>No exams on this course!</p> :
            <Paper>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Date</TableCell>
                            <TableCell>Grade</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {exams.map(e => {
                            return (
                                <TableRow key={isoExamID.unwrap(e.id)}>
                                    <TableCell>{e.date.setLocale('es-AR').toLocaleString(DateTime.DATE_SHORT)}</TableCell>
                                    <TableCell>
                                        {e.grade.match({
                                            Some: (g => g.toFixed(2)),
                                            None: () => "No grade",
                                        })}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </Paper>
    )
};

const translateCenter = {
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
};


// ---- REQUESTS ----


export function httpGetAndDecode<A>(url: string, decoder: Decoder<A>): Future<A> {
    return Future.of(fetch(url))
        .flatMap(res => Future.of(res.json()))
        .flatMap(json => decoder.decodeJson(JSON.stringify(json))
            .cata({
                Err: decoderError => {
                    console.error("Request decoder error: " + decoderError, url, json)
                    return Future.failed(decoderError)
                },
                Ok: result => Future.ok(result),
            }))
}

export const studentCourses = (studentId: StudentID): Future<Vector<Course>> =>
    httpGetAndDecode(
        `${baseUrl}/student/${isoStudentID.unwrap(studentId)}/courses`,
        vector(courseDecoder),
    )


export const courseStudentExams = (courseId: CourseID) => (studentId: StudentID): Future<Vector<Exam>> =>
    httpGetAndDecode(
        `${baseUrl}/getExamInscriptionByCourse/${isoCourseID.unwrap(courseId)}`,
        vector(examDecoder).map(v => v.filter(e => e.studentId == studentId)),
    )


// ---- DECODERS ----


function map2<A, B, C>(decA: Decoder<A>, decB: Decoder<B>, fn: ((a: A, b: B) => C)): Decoder<C> {
    return new Decoder(value => {
        return decA.decodeAny(value)
            .andThen(a => decB.decodeAny(value)
                .andThen(b => ok(fn(a, b))),
            )
    });
}

function vector<A>(decoder: Decoder<A>): Decoder<Vector<A>> {
    return array(decoder)
        .map(Vector.ofIterable)
}

function option<A>(decoder: Decoder<A>): Decoder<Option<A>> {
    return new Decoder(value => {
        return decoder.decodeAny(value).cata({
            Err: e => ok(Option.none()),
            Ok: v => ok(Option.some(v)),
        });
    });
}

const stringToDateTime = (str: string) => DateTime.fromFormat(str, 'd/M/yyyy');

const courseDecoder: Decoder<Course> =
    succeed({})
        .assign('id', field('id', string).map(isoCourseID.wrap))
        .assign('subjectName', at(["subject"], field("subjectName", string)))
        .assign('interval',
            map2(
                field('startDate', string).map(stringToDateTime),
                field('endDate', string).map(stringToDateTime),
                Interval.fromDateTimes,
            ),
        )
        .assign('exams', succeed([]));

// TODO Remove FullExam shenanigans when server adds a way to filter exams by student AND course
type FullExam = Exam & { studentId: StudentID }

const examDecoder: Decoder<FullExam> =
    succeed({})
        .assign('id', at(['exam'], field('id', string).map(isoExamID.wrap)))
        .assign('date', at(['exam'], field('date', string.map(stringToDateTime))))
        .assign('grade', field('result', option(number)))
        .assign('studentId', at(['student'], field('id', string).map(isoStudentID.wrap)));

const userDecoder: Decoder<Student> =
    succeed({})
        .assign('id', field('id', string).map(isoStudentID.wrap));